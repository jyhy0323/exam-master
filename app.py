import os
import json
import re
import logging
import io
import requests
from pypdf import PdfReader
from bs4 import BeautifulSoup
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai
from google.genai import types

# 1. 로깅 및 환경 설정
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
PORT = int(os.getenv("PORT", 5002))

if not GEMINI_API_KEY:
    logging.warning("⚠️ GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다.")

# 2. Flask 및 Gemini 클라이언트 초기화
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 최대 100MB 업로드 허용
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

def clean_json_response(raw_text: str) -> dict:
    """Gemini 응답에서 마크다운 코드 블록, 후행 쉼표, 이스케이프 오류 등을 복구하여 완벽한 JSON 딕셔너리로 안전하게 파싱"""
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    # 1차 시도: 표준 json.loads
    try:
        return json.loads(text)
    except Exception as e1:
        logging.warning(f"⚠️ 1차 표준 JSON 파싱 실패 ({e1}), 복구 알고리즘 시작...")

    # 2차 시도: 중괄호 영역 추출 및 후행 쉼표(trailing comma) 정규식 정제
    candidate = text
    match = re.search(r"(\{.*\})", text, re.DOTALL)
    if match:
        candidate = match.group(1)

    try:
        # trailing comma 제거 (예: ,} -> } 또는 ,] -> ])
        sanitized = re.sub(r",\s*([\]}])", r"\1", candidate)
        return json.loads(sanitized)
    except Exception as e2:
        logging.warning(f"⚠️ 2차 후행 쉼표 정제 실패 ({e2}), json_repair 복구 시도...")

    # 3차 시도: json_repair 라이브러리를 통한 문법/따옴표/쉼표 자동 복구
    try:
        from json_repair import repair_json
        repaired = repair_json(candidate, return_objects=True)
        if isinstance(repaired, dict) and "questions" in repaired:
            logging.info("🎉 json_repair로 손상된 JSON 파싱 성공!")
            return repaired
        elif isinstance(repaired, dict):
            logging.info("🎉 json_repair로 딕셔너리 복구 성공!")
            return repaired
        elif isinstance(repaired, list) and len(repaired) > 0 and isinstance(repaired[0], dict):
            logging.info("🎉 json_repair로 리스트 형태 JSON 복구 성공!")
            return {"questions": repaired}
    except Exception as e3:
        logging.error(f"❌ json_repair 복구 실패: {e3}")

    # 4차 시도: 전체 원문 텍스트 대상 json_repair
    from json_repair import repair_json
    final_res = repair_json(text, return_objects=True)
    if isinstance(final_res, dict):
        return final_res
    elif isinstance(final_res, list):
        return {"questions": final_res}

    raise ValueError(f"JSON 구조를 복구할 수 없습니다: {text[:200]}...")

# 3. 라우트 정의
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "api_key_configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL
    })

@app.route("/api/extract-pdf", methods=["POST"])
def extract_pdf():
    """업로드된 PDF 파일에서 텍스트를 추출하여 반환"""
    if "file" not in request.files:
        return jsonify({"success": False, "error": "업로드된 파일이 없습니다."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "선택된 파일이 없습니다."}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"success": False, "error": "PDF 파일만 업로드할 수 있습니다."}), 400

    try:
        reader = PdfReader(io.BytesIO(file.read()))
        total_pages = len(reader.pages)

        # 시작/종료 페이지 파라미터 (지정 없으면 전체 추출, 최대 500페이지)
        start_page = int(request.form.get("start_page", 1))
        end_page = int(request.form.get("end_page", total_pages))
        start_idx = max(0, start_page - 1)
        end_idx = min(total_pages, max(start_idx + 1, end_page))

        extracted_text = []
        for idx in range(start_idx, end_idx):
            page = reader.pages[idx]
            page_text = page.extract_text() or ""
            cleaned = page_text.strip()
            if cleaned:
                extracted_text.append(f"--- [페이지 {idx + 1}] ---\n{cleaned}")

        full_text = "\n\n".join(extracted_text)
        if not full_text.strip():
            return jsonify({
                "success": False,
                "error": "PDF에서 텍스트를 추출할 수 없습니다. (스캔된 이미지 전용 PDF일 수 있습니다)"
            }), 400

        logging.info(f"📄 대용량 PDF 텍스트 추출 완료: {file.filename} (범위: {start_idx+1}~{end_idx}p / 총 {total_pages}p, {len(full_text)}자)")
        return jsonify({
            "success": True,
            "filename": file.filename,
            "total_pages": total_pages,
            "extracted_range": f"{start_idx+1}~{end_idx}페이지",
            "extracted_length": len(full_text),
            "text": full_text
        })

    except Exception as e:
        logging.error(f"❌ PDF 추출 오류: {e}")
        return jsonify({"success": False, "error": f"PDF 분석 중 오류가 발생했습니다: {str(e)}"}), 500

DONGWONLAB_FALLBACK_QUIZZES = [
    {
        "id": "quiz_cost_w1_q1",
        "course": "원가회계",
        "session": "1주차",
        "question": "옳은 것은?",
        "options": [
            "비용은 특정 자원을 위해 발생하는 유출이다.",
            "원가는 수익을 얻는 과정에서 소멸된 비용이다.",
            "원가대상은 원가를 계산하고 집계하는 단위이다.",
            "총원가는 재료원가, 노무원가, 경비의 합이다."
        ],
        "answer": "정답 3번 (해설: 원가대상은 원가를 계산하고 집계하는 단위임. 참고로 제조원가의 3요소는 재료원가, 노무원가, 제조경비임)"
    },
    {
        "id": "quiz_cost_w1_q2",
        "course": "원가회계",
        "session": "1주차",
        "question": "다음 중 틀린 것은?",
        "options": [
            "활동에 따라 제조원가와 비제조원가를 구분한다",
            "원가의 추적가능성에 따라 직접원가와 간접원가를 구분한다",
            "원가행태에 따라 변동원가와 고정원가를 구분한다",
            "재무회계와 관리회계 모두 내부 의사결정 목적으로 작성한다"
        ],
        "answer": "정답 4번 (해설: 4번이 틀린 문장임. 재무회계는 외부정보이용자 보고 목적이며, 관리회계가 내부 의사결정 목적임)"
    },
    {
        "id": "quiz_cost_w2_draft_1",
        "course": "원가회계",
        "session": "2주차",
        "question": "Q1 다음 중 의사결정에 영향을 미치는 원가가 아닌 것은?",
        "options": [
            "관련원가",
            "기발생원가",
            "기회원가",
            "관련원가와 기회원가 모두"
        ],
        "answer": "정답 2번 (해설: 기발생원가·매몰원가는 과거에 이미 발생한 원가로 미래 의사결정에 영향을 미치지 않는 비관련원가임)"
    },
    {
        "id": "quiz_1789398868577_6423",
        "course": "원가회계",
        "session": "2주차",
        "question": "제조원가명세서에 관한 설명으로 틀린 것은?",
        "options": [
            "직접재료원가(DM), 직접노무원가(DL), 제조간접원가(OH)의 합계는 당기총제조원가이다.",
            "기초재공품에 당기총제조원가를 더하면 당기에 완성할 수 있는 재공품의 총원가가 된다.",
            "당기총제조원가에 기말재공품을 더하고 기초재공품을 차감하면 당기제품제조원가가 된다.",
            "기말재공품에 포함된 제조원가는 당기제품제조원가에서 제외된다."
        ],
        "answer": "정답 3번 (해설: 3번 선지는 기초와 기말을 반대로 적어서 틀린 문장임. 올바른 공식은 당기총제조원가에 기초재공품을 더하고 기말재공품을 차감해야 당기제품제조원가가 됨)"
    },
    {
        "id": "quiz_1789399375936_d874",
        "course": "원가회계",
        "session": "2주차",
        "question": "다음 중 틀린 것은?",
        "options": [
            "당기총제조원가는 당기에 투입된 생산요소(input)의 원가이다.",
            "당기제품제조원가는 당기에 완성된 제품(output)의 원가이다.",
            "제조원가명세서는 제조원가의 세부 금액과 원가 흐름을 보여 주는 부속명세서로 상장기업에는 공시 의무가 있다.",
            "제조경비는 제조원가 중에서 재료원가와 노무원가를 제외한 나머지 원가이다."
        ],
        "answer": "정답 3번 (해설: 3번이 틀린 문장임. K-IFRS에서 제조원가명세서는 의무 공시 재무제표가 아님)"
    },
    {
        "id": "quiz_1790005616504_3821",
        "course": "원가회계",
        "session": "3주차",
        "question": "개별원가계산에 관한 설명으로 옳지 않은 것은?",
        "options": [
            "건설업이나 조선업처럼 작업(주문)별로 제품 규격이 달라 원가가 서로 다른 경우에 적합함",
            "직접재료원가와 직접노무원가는 각 작업에 직접 추적하여 개별작업원가표에 기록하고, 제조간접원가는 배부기준에 따라 각 작업에 배부함",
            "법률·회계 자문 등 서비스업에서는 재공품이나 제품 같은 재고자산이 남지 않는 기간원가이므로, 주로 의사결정과 수익성 분석에 활용됨",
            "개별원가계산은 원가의 집계 방법에 따른 분류이므로, 실제원가계산이나 정상원가계산과 함께 사용할 수 없음"
        ],
        "answer": "정답 4번 (해설: 4번이 틀린 문장임. 개별원가계산과 종합원가계산은 '원가의 집계 방법'에 따른 분류가 맞으며, '원가의 측정 방법'에 따른 분류인 실제원가계산·정상원가계산·표준원가계산과 서로 결합하여 실제개별원가계산·정상개별원가계산으로 함께 사용할 수 있음)"
    },
    {
        "id": "quiz_1790006042384_494d",
        "course": "원가회계",
        "session": "3주차",
        "question": "다음은 제조간접원가 배부에 필요한 배부기준 선택기준에 관한 설명이다. 틀린 것은?",
        "options": [
            "인과관계기준을 가장 타당하여 우선 적용함. 인과관계를 찾기 어려울 때는 수혜기준을 적용함. 단, 수혜기준은 원가배부 결과가 왜곡되거나 경영자의 자의성이 개입될 수 있다는 한계가 있음",
            "원가대상이 제조간접원가로부터 제공받은 경제적 효익에 비례하여 배부함 - 수혜기준",
            "원가대상의 수익이나 급여 등 원가를 부담할 수 있는 정도에 비례하여 배부함 - 부담능력기준",
            "동력비와 같이 작업시간이나 기계가동시간에 비례하여 배부함 - 인과관계기준"
        ],
        "answer": "정답 1번 (해설: 1번이 틀린 문장임. 원가배부 결과가 왜곡되거나 부담능력에 따라 왜곡될 수 있는 한계는 수혜기준이 아니라 '부담능력기준'에 관한 설명임)"
    },
    {
        "id": "quiz_1790006130183_e6b4",
        "course": "원가회계",
        "session": "3주차",
        "question": "실제개별원가계산에 관한 설명으로 옳지 않은 것은?",
        "options": [
            "직접노무원가는 작업이 진행됨에 따라 발생 즉시 집계하므로, 회계기간이 끝나기 전에도 개별 작업의 직접원가는 확인할 수 있음",
            "제조간접원가는 실제 발생액을 제조간접원가 계정의 차변에 집계하였다가, 배부율을 곱한 금액을 재공품 계정으로 대체함",
            "보통 1개월 단위로 계산하면, 1년 단위로 계산할 때보다 제조간접원가 배부율이 평준화되어 작업별 원가의 기간별 비교가 쉬워짐",
            "보통 1개월 단위로 계산하면, 계절적 요인이나 조업도 증감에 따라 제조간접원가 배부율의 변동 폭이 커질 수 있음"
        ],
        "answer": "정답 3번 (해설: 3번이 틀린 문장임. 1개월 단위로 실제원가계산을 하면 계절적 요인과 조업도 변동으로 인해 배부율이 매달 크게 변동하여 기간별 비교가 어려워짐. 1년 단위 예정배부율을 쓰는 정상원가계산을 해야 평준화됨)"
    },
    {
        "id": "quiz_1790689931546_bcd9",
        "course": "원가회계",
        "session": "4주차",
        "question": "정상개별원가계산에 관한 설명으로 옳지 않은 것은?",
        "options": [
            "직접재료원가와 직접노무원가는 실제발생액을 기준으로 집계함",
            "제조간접원가는 기초에 예측한 연간 제조간접원가 예산과 연간 예정배부기준을 바탕으로 예정배부율을 계산하여 배부함",
            "개별 작업에 배부할 제조간접원가는 실제배부기준에 예정배부율을 곱하여 계산함",
            "실제원가계산에 비해 작업이 완료되는 시점에 제조간접원가 실제발생액을 바로 파악할 수 있어 지체 없이 제품원가를 확정함"
        ],
        "answer": "정답 4번 (해설: 4번이 틀린 문장임. 정상개별원가계산은 작업 완료 시점에 실제발생액이 아니라 '예정배부율'을 적용하여 제품원가를 신속히 계산하며, 제조간접원가 실제발생액은 기말에 파악됨)"
    },
    {
        "id": "quiz_1790690009455_70c2",
        "course": "원가회계",
        "session": "4주차",
        "question": "제조간접원가 배부차이에 관한 설명으로 옳은 것은?",
        "options": [
            "제조간접원가 예정배부액이 실제발생액보다 크면 과소배부라 함",
            "과대배부가 발생한 경우, 원가배부차이를 조정하면 매출원가가 감소함",
            "과소배부가 발생한 경우, 이를 조정하면 재고자산과 매출원가가 감소함",
            "배부차이는 예정제조간접원가와 실제제조간접원가 총액이 다를 때만 발생하고, 배부기준량의 차이와는 무관함"
        ],
        "answer": "정답 2번 (해설: 2번이 옳은 문장임. 과대배부(예정배부액 > 실제발생액)가 발생하면 원가가 실제보다 과대계산된 것이므로 조정 시 재고자산·매출원가를 차감(감소)함)"
    },
    {
        "id": "quiz_1790690063952_8d9e",
        "course": "원가회계",
        "session": "4주차",
        "question": "제조간접원가 배부차이 조정방법에 관한 설명으로 옳지 않은 것은?",
        "options": [
            "매출원가조정법은 계산이 간편하지만, 배부차이가 크면 손익이 왜곡될 수 있음",
            "기말잔액 비례배분법은 기말잔액에 기존 예정배부액이 포함되어 있어 배부차이를 이중으로 가중치 부여하는 한계가 있음",
            "원가요소별 비례배분법은 기말재공품, 기말제품, 매출원가에 포함된 당기 제조간접원가 예정배부액 비율로 안분하므로 가장 정교한 방법임",
            "어떤 배부차이 조정방법을 사용하더라도 재공품·제품·매출원가에 배분되는 실제 제조간접원가의 총액은 달라짐"
        ],
        "answer": "정답 4번 (해설: 4번이 틀린 문장임. 어떤 배부차이 조정방법을 사용하더라도 배부차이 조정 후 기말재공품·기말제품·매출원가에 배분된 전체 실제 제조간접원가 총액의 합계는 항상 동일함)"
    },
    {
        "id": "quiz_1791200637197_e723",
        "course": "원가회계",
        "session": "5주차",
        "question": "종합원가계산에 관한 설명으로 옳지 않은 것은?",
        "options": [
            "동질적인 제품을 연속적으로 대량생산하는 업종에 적합하며, 공정별·기간별로 원가를 집계하여 계산함",
            "완성품환산량은 투입된 원가요소별로 완성도를 적용하여 산정하며, 원가요소별로 완성도가 다를 수 있음",
            "직접재료가 공정 초기에 전량 투입되는 경우, 기말재공품의 직접재료원가 완성도는 가공비 완성도와 같음",
            "가공원가는 직접노무원가와 제조간접원가를 합한 원가로, 전환원가라고도 부름"
        ],
        "answer": "정답 3번 (해설: 3번이 틀린 문장임. 직접재료가 공정 초기에 전량 투입되면 기말재공품의 직접재료원가 완성도는 진행도와 무관하게 100%가 되며, 공정 전반에 균등 발생하는 가공원가 완성도와 다름)"
    },
    {
        "id": "quiz_1791200696105_633c",
        "course": "원가회계",
        "session": "5주차",
        "question": "가중평균법과 선입선출법에 관한 설명으로 옳은 것은?",
        "options": [
            "가중평균법은 기초재공품원가를 제외하고 당기발생원가만으로 환산량 단위당 원가를 계산함",
            "기초재공품이 없는 경우, 두 방법으로 계산한 완성품원가와 기말재공품원가는 서로 같음",
            "선입선출법의 완성품환산량은 당기완성품 수량에 기말재공품 환산량을 더한 것임",
            "선입선출법에서는 기초재공품원가가 완성품과 기말재공품에 환산량 비율로 배분됨"
        ],
        "answer": "정답 2번 (해설: 2번이 옳은 문장임. 기초재공품이 없는 경우에는 가중평균법과 선입선출법으로 계산한 완성품원가와 기말재공품원가가 서로 완전히 동일함)"
    },
    {
        "id": "quiz_1791200786234_6bf9",
        "course": "원가회계",
        "session": "5주차",
        "question": "제조원가가 계속 상승하는 상황에서 가중평균법과 선입선출법을 비교한 설명으로 옳지 않은 것은? (단, 기초재공품이 존재함)",
        "options": [
            "기말재공품원가는 선입선출법이 가중평균법보다 큼",
            "매출원가는 선입선출법이 가중평균법보다 작음",
            "선입선출법은 기말재공품에 최근 원가가 반영되어 재고자산 평가가 현실적임",
            "매출총이익과 법인세는 선입선출법이 가중평균법보다 작음"
        ],
        "answer": "정답 4번 (해설: 4번이 틀린 문장임. 원가 상승 시 선입선출법은 기말재공품원가가 크고 매출원가가 가중평균법보다 작으므로, 매출총이익과 법인세는 선입선출법이 가중평균법보다 큼)"
    }
]


@app.route("/api/extract-url", methods=["POST"])
def extract_url():
    """웹페이지 링크(URL)에서 핵심 텍스트를 스크랩하여 추출"""
    data = request.get_json() or {}
    url = data.get("url", "").strip()
    selected_weeks = data.get("weeks", [])  # 예: ["1주차", "2주차"] 또는 빈 리스트(전체)

    if not url:
        return jsonify({"success": False, "error": "URL 주소를 입력해 주세요."}), 400

    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        # dongwonlab.com 특화 처리: 실시간 서버 조회 + 502 에러 시 내장 백업 DB 자동 폴백 + 주차별 선택 필터링
        if "dongwonlab" in url.lower():
            quizzes = []
            used_fallback = False
            fallback_answer_map = {q["id"]: q["answer"] for q in DONGWONLAB_FALLBACK_QUIZZES}
            fallback_q_map = {q["question"].strip(): q["answer"] for q in DONGWONLAB_FALLBACK_QUIZZES}

            try:
                api_resp = requests.get("http://dongwonlab.com/api/courses", headers=headers, timeout=4)
                if api_resp.status_code == 200:
                    api_data = api_resp.json()
                    live_quizzes = api_data.get("active_quizzes", [])
                    if live_quizzes:
                        quizzes = [q for q in live_quizzes if q.get("course", "원가회계") == "원가회계"] or live_quizzes
                        # 실시간 서버 응답에는 정답/해설 필드가 없으므로 내장 검증 DB의 정답·해설을 자동 매칭하여 결합
                        for q in quizzes:
                            if not q.get("answer"):
                                q["answer"] = fallback_answer_map.get(q.get("id")) or fallback_q_map.get(q.get("question", "").strip(), "")
            except Exception as e:
                logging.warning(f"dongwonlab 실시간 서버 접속 예외 (내장 백업으로 자동 전환): {e}")

            if not quizzes:
                quizzes = list(DONGWONLAB_FALLBACK_QUIZZES)
                used_fallback = True
                logging.info("🛡️ dongwonlab 서버 응답 지연/502 감지 -> 내장된 1~5주차 원가회계 퀴즈 백업 데이터를 사용합니다.")

            # 주차별 필터링 적용
            valid_weeks = [w.strip() for w in selected_weeks if isinstance(w, str) and w.strip() and w.strip() != "all"]
            if valid_weeks:
                filtered_quizzes = [q for q in quizzes if q.get("session", "") in valid_weeks]
                week_label = ", ".join(valid_weeks)
            else:
                filtered_quizzes = quizzes
                week_label = "1~5주차 전체"

            if not filtered_quizzes:
                return jsonify({
                    "success": False,
                    "error": f"선택하신 주차({week_label})에 해당하는 동원랩 퀴즈가 없습니다."
                }), 400

            quiz_blocks = []
            for idx, q in enumerate(filtered_quizzes, 1):
                course = q.get("course", "원가회계")
                session = q.get("session", "")
                quest = q.get("question", "")
                options = q.get("options", [])
                answer_info = q.get("answer", "")
                opt_str = "\n".join([f"  {i+1}. {opt}" for i, opt in enumerate(options)])
                block = f"[동원랩 퀴즈 {idx}] ({course} - {session})\n문제: {quest}\n선택지:\n{opt_str}"
                if answer_info:
                    block += f"\n[검증된 정답 및 해설]: {answer_info}"
                quiz_blocks.append(block)

            full_dongwon_text = "\n\n".join(quiz_blocks)
            source_note = "내장 백업본" if used_fallback else "실시간 서버"
            logging.info(f"🎯 dongwonlab.com 퀴즈 추출 성공! ({week_label}, {len(filtered_quizzes)}문항, 출처: {source_note})")
            return jsonify({
                "success": True,
                "is_dongwonlab": True,
                "used_fallback": used_fallback,
                "selected_weeks": valid_weeks if valid_weeks else ["1주차", "2주차", "3주차", "4주차", "5주차"],
                "week_label": week_label,
                "quiz_count": len(filtered_quizzes),
                "target_field": "practice_problems",
                "subject": f"원가회계 ({week_label} 교수님 퀴즈 족보)",
                "title": f"동원랩 원가회계 퀴즈 족보 [{week_label}] (총 {len(filtered_quizzes)}문항)",
                "text": full_dongwon_text
            })

        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()

        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        # 불필요한 태그 제거 (스크립트, 스타일, 네비게이션, 푸터 등)
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else "웹페이지 본문"
        
        # 본문 텍스트 추출 및 정돈
        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        clean_text = "\n".join(lines)

        if len(clean_text) > 30000:
            clean_text = clean_text[:30000] + "\n...(이하 생략)"

        if len(clean_text) < 50:
            return jsonify({
                "success": False,
                "error": "해당 웹페이지에서 충분한 텍스트 내용을 가져오지 못했습니다. 로그인이 필요한 페이지인지 확인해 주세요."
            }), 400

        logging.info(f"🔗 URL 웹페이지 추출 완료: {url} (제목: {title}, 길이: {len(clean_text)}자)")
        return jsonify({
            "success": True,
            "title": title,
            "url": url,
            "text": clean_text
        })

    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "해당 링크의 응답 시간이 초과되었습니다 (Timeout)."}), 408
    except requests.exceptions.RequestException as e:
        return jsonify({"success": False, "error": f"웹페이지를 불러올 수 없습니다: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"웹페이지 분석 중 오류: {str(e)}"}), 500

@app.route("/api/generate", methods=["POST"])
def generate_exam():
    if not client:
        return jsonify({"success": False, "error": "Gemini API 키가 서버에 설정되지 않았습니다."}), 500

    try:
        data = request.get_json() or {}
        lecture_notes = data.get("lecture_notes", "").strip()
        practice_problems = data.get("practice_problems", "").strip()
        subject_name = data.get("subject_name", "중간고사 대비 시험").strip() or "중간고사 대비 시험"
        mode = data.get("mode", "hit_focus")  # "hit_focus" (족보 적중 모드) or "comprehensive" (개념 종합)
        question_count = int(data.get("question_count", 10))
        # 1문제부터 최대 50문제까지 지원
        question_count = max(1, min(50, question_count))

        # 시험 제한 시간 (분): 0이면 무제한, None이면 문항당 2분(최소 10분) 자동 계산
        time_limit_raw = data.get("time_limit_minutes", None)
        if time_limit_raw is not None and str(time_limit_raw).isdigit():
            time_limit_minutes = int(time_limit_raw)
        else:
            time_limit_minutes = max(10, question_count * 2)

        question_types = data.get("question_types", "mix")  # "mix", "multiple_choice", "subjective"
        difficulty = data.get("difficulty", "hard")  # "hard", "standard", "basic"

        if not lecture_notes and not practice_problems:
            return jsonify({"success": False, "error": "강의 자료 내용이나 교수님 연습문제를 하나 이상 입력해 주세요."}), 400

        logging.info(f"📝 시험 생성 요청: 과목={subject_name}, 모드={mode}, 난이도={difficulty}, 문항수={question_count}, 제한시간={time_limit_minutes}분, 유형={question_types}")

        prompt = f"""
[Role & Context]
너는 대학 전공 시험을 출제하는 꼼꼼한 대학교수다.
입력된 PPT/문서 자료만을 바탕으로, 학술적 오류가 전혀 없는 정교한 객관식 문제를 생성하라.
학생이 제공한 자료를 정밀 분석하여 실제 대학교 중간고사 시험에 출제될 확률이 매우 높은 실전 모의고사 {question_count}문항을 생성해 주세요.

[Strict Presentation Rules]
1. 모든 정답 및 오답 선지는 학술적으로 완벽한 'Fact'에만 기반해야 한다.
2. 특정 상황이나 예외(예: 감가상각, 손상차손 등)에 따라 참/거짓이 바뀔 수 있는 모호한 표현이나 절대적인 단어(예: '그대로 유지된다', '절대 없다', '항상 같다')는 선지에 사용하지 마라.
3. 오답 선지(틀린 설명)를 만들 때는, 본문에 나온 명확한 개념을 서로 반대로 뒤집거나(예: 원가와 비용의 인식 시점 전환) 확실한 정의 오류를 이용하라.
4. 문제 생성 후, 스스로 각 선지(1번~5번)를 다시 검토하여 "해석에 따라 정답이 바뀔 여지가 있는가?"를 셀프 피드백하고, 조금이라도 모호하다면 선지를 더 명확한 문장으로 전면 수정하여 출력하라.

[입력된 과목명]
{subject_name}

[출제 모드]
{"🎯 족보 적중 모드: 교수님의 참여 웹 연습문제와 예제를 바탕으로, 원래 문제의 핵심 개념을 그대로 출제하거나 보기를 변형/반대 상황을 묻는 '기출 쌍둥이 변형 문제'를 최우선으로 다수 출제하세요." if mode == "hit_focus" else "📚 개념 심화 모드: 강의 자료 전체의 이론, 정의, 핵심 원리를 골고루 다루어 빈틈없이 대비할 수 있도록 출제하세요."}

[출제 난이도 및 킬러 계산 문제 엄격 지침]
- 현재 설정된 난이도: {"🔥 실전 대학시험 / 킬러 계산 모드 (암산 불가·연습장 손풀이 필수)" if difficulty == "hard" else ("표준 중간고사 모드" if difficulty == "standard" else "기초 점검 모드")}
- 【절대 단순 암산 금지 & 전공 교재 실전 연습문제 수준 준수】:
  학생이 제공한 교재나 PDF의 실제 연습문제들은 손으로 직접 연습장에 2~4단계 계산 과정을 전개해야만 답이 나오는 전공 수준의 문제들입니다.
  단순히 공식에 숫자 하나를 넣어 5초 만에 암산으로 풀리는 문제는 절대로 출제하지 마세요!
- 【계산형 문제 출제 필수 원칙】:
  1. [자료] 또는 [표] 상세 조건 제시:
     계산형 문제의 경우 질문(question) 본문이나 code_snippet에 실제 대학교 시험처럼 구체적인 조건과 수치 데이터 박스를 반드시 제시하세요.
     (예: 수량 흐름, 단가, 기초/기말 재고량 및 진행도(%), 부문별 배부기준, 단위당 변동비, 총고정비, 목표이익, 법인세율, 메모리 주소 비트수 등)
  2. 2단계 이상의 복합/연쇄 계산:
     1단계 계산 결과가 2단계와 3단계의 입력값으로 이어지는 다단계 계산 구조(예: 환산량 계산 -> 단위당 원가 도출 -> 기말재공품 및 매출원가 분배)로 출제하세요.
  3. 실전 함정 선지(Distractors) 정밀 설계:
     학생들이 중간 계산 과정에서 흔히 저지르는 전형적 실수(예: 공정 초 투입인데 기말 완성도를 곱하거나, 기초재고를 누락하는 등)를 반영한 오답 수치를 4~5지선다 보기에 교묘하게 배치하세요.
  4. 해설(explanation)의 단계별 풀이 증명:
     계산 문제의 explanation에는 반드시 `[단계별 계산 풀이] 1단계: ... -> 2단계: ... -> 3단계: ... -> 따라서 최종 정답: ...` 형태로 수식과 풀이 과정을 완벽하게 서술하세요.

[문항 유형 요구사항]
- 요청 유형: {question_types}
- {"객관식(4~5지선다)과 주관식(단답형/핵심 용어 쓰기)을 적절히 혼합하세요. 객관식 약 70%, 주관식 약 30% 비율." if question_types == "mix" else ("모든 문제를 4지선다 또는 5지선다 객관식으로 출제하세요." if question_types == "multiple_choice" else "모든 문제를 주관식 단답형(핵심 용어, 기술명, 약어, 빈칸 채우기)으로 출제하세요.")}

[입력 데이터 1: 교수님 강의 자료 및 예제 요약]
{lecture_notes if lecture_notes else "(입력 없음)"}

[입력 데이터 2: 교수님 웹 이론 연습문제 및 퀴즈 (★실제 시험 출제 유력 족보★)]
{practice_problems if practice_problems else "(입력 없음)"}

[대용량 수백 페이지 강의 자료 핵심 축약 원칙]
- 제공된 자료의 분량이 많은 경우(수십~수백 페이지 슬라이드나 교재), 절대 특정 단원이나 앞부분에만 치우치지 마세요.
- 전체 자료의 목차와 주차별 대단원(1주차, 2주차, 3주차...) 흐름을 조망하고, 각 단원별로 골고루 핵심만을 정밀 추출하여 {question_count}문항으로 압축 출제하세요.
- 단순 지엽적인 문장보다는 '교수님이 중간고사에 반드시 출제하는 핵심 정의', '주요 공식/원가 계산의 원리 및 흐름', '개념 간의 비교 및 차이점'을 집중 타겟팅하세요.

[출제 규칙]
1. 객관식(multiple_choice):
   - options는 4개 또는 5개의 현실적이고 그럴듯한 보기를 제공합니다 (예: ["1. ...", "2. ...", "3. ...", "4. ...", "5. ..."]).
   - correct_answer는 options 중 정답 보기 문자열과 정확히 일치해야 합니다.
   - 출제 후 스스로 각 선지(1번~5번)의 참/거짓 여부를 재검증하여 복수정답 논란이 있는 애매한 선지가 절대 없도록 하세요.
2. 주관식(subjective):
   - options는 빈 배열 []로 둡니다.
   - 질문은 단답형으로 떨어질 수 있게 명확해야 합니다 (예: "~하는 기법의 명칭은 무엇인가?", "~에 들어갈 핵심 용어를 쓰시오").
   - correct_answer는 대표 모범 정답입니다.
   - keywords에는 대소문자, 한글/영문 표기 차이 등을 감안하여 채점에 필요한 핵심 키워드 리스트를 2~4개 작성하세요 (예: ["객체지향", "OOP", "Object-Oriented"]).
3. explanation(해설 - ★반드시 options 및 correct_answer보다 먼저 작성하여 선지 설계·계산 검산을 완료한 후 보기를 출력할 것★):
   - JSON 출력 시 반드시 `explanation` 필드를 `options`와 `correct_answer`보다 **먼저** 작성하세요!
   - "틀린 것은?" 문제를 출제할 때는 `explanation`에서 먼저 어떤 보기를 명백한 오답(틀린 설명, 예: 기초와 기말을 반대로 서술)으로 만들지 명확히 설계한 뒤, `options`에 실제로 그 **틀린 문장**을 배치하세요. (절대로 해설의 '올바르게 고친 문장'을 보기에 그대로 넣어서 모든 보기가 옳은 문장이 되는 출제 오류를 범하지 마세요!)
   - 해설 문장에는 '잠시 확인', '잠시만요', '아, 맞음' 같은 혼잣말이나 시행착오 과정을 절대 적지 말고, 깔끔하게 검증 완료된 정석 풀이 과정과 1~5번 선지 분석, "시험 꿀팁"만 명확히 서술하세요.
4. source_tag:
   - 이 문제가 어디서 유래했는지 표기합니다 (예: "교수님 참여웹 3강 연습문제 변형", "강의 슬라이드 2장 핵심 정의").

반드시 아래 JSON 형식으로만 응답하세요 (`explanation`을 가장 먼저 작성하여 계산과 선지 정·오답 설계를 끝낸 뒤 `options`와 `correct_answer`를 출력하는 순서를 엄격히 지키세요). 백틱(`) 마크다운 코드블록이나 불필요한 설명 없이 순수 JSON 텍스트만 출력하세요:
{{
  "exam_title": "{subject_name} 중간고사 대비 실전 모의고사",
  "subject": "{subject_name}",
  "total_questions": {question_count},
  "time_limit_minutes": {time_limit_minutes},
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "question": "문제 내용...",
      "code_snippet": "필요한 경우 코드나 표, 없으면 빈 문자열",
      "explanation": "[선지 분석 및 정답 도출] 먼저 정확히 계산하고 1~4번 중 어느 선지를 틀린/옳은 보기로 구성할지 명확히 해설...",
      "options": [
        "1. 보기 내용",
        "2. 보기 내용",
        "3. 보기 내용",
        "4. 보기 내용"
      ],
      "correct_answer": "1. 보기 내용",
      "keywords": [],
      "source_tag": "교수님 참여웹 연습문제 변형",
      "difficulty": "중"
    }}
  ]
}}

[JSON 출력 필수 규칙]
1. 유효한 단 하나의 JSON 객체만을 출력하세요. 백틱이나 불필요한 설명은 금지합니다.
2. 문자열 내부(질문, 보기, 해설 등)에서 회사명이나 인용구를 쓸 때는 큰따옴표(") 대신 반드시 작은따옴표(')를 사용하세요. (예: '(주)대한'처럼 작성)
3. 배열이나 객체의 마지막 원소 뒤에 쉼표(Trailing comma)를 절대 붙이지 마세요.
4. `correct_answer`는 반드시 `explanation`에서 도출한 최종 계산 결과 및 정답 번호와 100% 일치해야 합니다.
5. "틀린 것은?" 문제에서 `options`의 정답 선지는 반드시 명백히 **틀린 내용**으로 작성되어 있어야 하며, 모든 선지가 옳은 내용이 되는 일이 절대 없도록 하세요.
"""

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
                max_output_tokens=8192
            )
        )

        exam_data = clean_json_response(response.text)

        # 후처리 검증: 해설(explanation)에서 최종 선언한 정답 번호와 correct_answer 불일치 시 자동 교정
        for q in exam_data.get("questions", []):
            if q.get("type") == "multiple_choice" and q.get("options"):
                exp_text = str(q.get("explanation", ""))
                cur_ans = str(q.get("correct_answer", "")).strip()
                options = [str(o).strip() for o in q.get("options", [])]

                # 해설 후반부에서 "정답은 N번", "최종 정답: N번", "정답: N번" 패턴 탐색
                matches = re.findall(r"(?:최종\s*정답|따라서\s*정답|정답)\s*(?:은|은\s*바로|:|은\s*보기)?\s*([1-5])\s*번", exp_text)
                if matches:
                    declared_num = matches[-1]  # 가장 마지막에 선언된 최종 정답 번호
                    if not cur_ans.startswith(f"{declared_num}."):
                        for opt in options:
                            if opt.startswith(f"{declared_num}."):
                                logging.info(f"🔧 [자동 교정] 문항 Q{q.get('id')}: 해설 결론({declared_num}번)에 맞춰 correct_answer를 '{cur_ans}' -> '{opt}'로 자동 수정했습니다.")
                                q["correct_answer"] = opt
                                break

        exam_data["time_limit_minutes"] = time_limit_minutes
        exam_data["total_questions"] = len(exam_data.get("questions", []))
        logging.info(f"✅ 시험 출제 완료: 총 {len(exam_data.get('questions', []))}문제, 제한시간={time_limit_minutes}분")
        return jsonify({"success": True, "exam": exam_data})

    except Exception as e:
        logging.error(f"❌ 시험 생성 중 오류: {e}")
        return jsonify({"success": False, "error": f"시험 생성 중 오류가 발생했습니다: {str(e)}"}), 500

@app.route("/api/grade", methods=["POST"])
def grade_exam():
    """사용자가 제출한 답안을 채점하고 결과 점수와 AI 처방 분석을 제공"""
    try:
        data = request.get_json() or {}
        questions = data.get("questions", [])
        user_answers = data.get("user_answers", {})
        time_spent_seconds = data.get("time_spent_seconds", 0)

        if not questions:
            return jsonify({"success": False, "error": "채점할 문항 정보가 없습니다."}), 400

        graded_questions = []
        correct_count = 0
        total_questions = len(questions)

        for q in questions:
            qid = str(q.get("id"))
            q_type = q.get("type", "multiple_choice")
            correct_ans = str(q.get("correct_answer", "")).strip()
            user_ans = str(user_answers.get(qid, "")).strip()
            keywords = q.get("keywords", [])

            is_correct = False
            earned_points = 0
            point_per_q = round(100.0 / total_questions, 1)

            if q_type == "multiple_choice":
                # 객관식: 완전 일치 또는 앞 번호 매칭
                if user_ans and (user_ans == correct_ans or user_ans[:2] == correct_ans[:2]):
                    is_correct = True
                    earned_points = point_per_q
                    correct_count += 1
            else:
                # 주관식: 키워드 포함 검사 또는 문자열 정규화 비교
                norm_user = user_ans.lower().replace(" ", "")
                norm_correct = correct_ans.lower().replace(" ", "")
                if norm_user and (norm_user == norm_correct or any(kw.lower().replace(" ", "") in norm_user for kw in keywords if kw)):
                    is_correct = True
                    earned_points = point_per_q
                    correct_count += 1
                elif not user_ans:
                    is_correct = False
                    earned_points = 0

            graded_questions.append({
                "id": q.get("id"),
                "type": q_type,
                "question": q.get("question"),
                "code_snippet": q.get("code_snippet", ""),
                "options": q.get("options", []),
                "user_answer": user_ans if user_ans else "(미응답)",
                "correct_answer": correct_ans,
                "is_correct": is_correct,
                "explanation": q.get("explanation", ""),
                "source_tag": q.get("source_tag", ""),
                "difficulty": q.get("difficulty", "보통"),
                "earned_points": earned_points
            })

        score = round((correct_count / total_questions) * 100)
        
        # 등급 산정
        if score >= 95: grade = "A+"
        elif score >= 90: grade = "A0"
        elif score >= 85: grade = "B+"
        elif score >= 80: grade = "B0"
        elif score >= 75: grade = "C+"
        elif score >= 70: grade = "C0"
        elif score >= 60: grade = "D"
        else: grade = "F"

        # AI 종합 학습 진단 생성
        summary_prompt = f"""
학생이 대학교 중간고사 대비 모의시험을 완료했습니다.
- 총 문제 수: {total_questions}문항 중 {correct_count}문항 정답
- 점수: {score}점 (등급: {grade})
- 소요 시간: {time_spent_seconds // 60}분 {time_spent_seconds % 60}초

틀린 문제들의 목록과 원래 개념:
{json.dumps([{ 'question': g['question'], 'user_answer': g['user_answer'], 'correct': g['correct_answer'], 'source': g['source_tag']} for g in graded_questions if not g['is_correct']], ensure_ascii=False)}

위 결과를 바탕으로, 학생에게 대학 전공 교수 또는 전문 과외 강사처럼 격려와 함께 '실제 중간고사 직전 3대 핵심 요약 및 약점 보완 팁'을 작성해 주세요.
친절하고 직관적인 한국어 텍스트로 3~5문장 내외로 작성하세요.
"""
        ai_prescription = "수고하셨습니다! 틀린 문제의 해설과 개념을 다시 한번 복습하면 실제 시험에서 좋은 성적을 거둘 수 있습니다."
        if client:
            try:
                ai_resp = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=summary_prompt,
                    config=types.GenerateContentConfig(temperature=0.3)
                )
                ai_prescription = ai_resp.text.strip()
            except Exception as e:
                logging.warning(f"⚠️ 종합 진단 생성 실패: {e}")

        return jsonify({
            "success": True,
            "score": score,
            "grade": grade,
            "correct_count": correct_count,
            "wrong_count": total_questions - correct_count,
            "total_questions": total_questions,
            "time_spent_seconds": time_spent_seconds,
            "graded_questions": graded_questions,
            "ai_prescription": ai_prescription
        })

    except Exception as e:
        logging.error(f"❌ 채점 중 오류: {e}")
        return jsonify({"success": False, "error": f"채점 중 오류가 발생했습니다: {str(e)}"}), 500

if __name__ == "__main__":
    logging.info(f"🚀 AI 중간고사 대비 모의시험 서버 시작: http://127.0.0.1:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
