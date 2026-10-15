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
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
PORT = int(os.getenv("PORT", 5002))

if not GEMINI_API_KEY:
    logging.warning("⚠️ GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다.")

# 2. Flask 및 Gemini 클라이언트 초기화
app = Flask(__name__)
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

def clean_json_response(raw_text: str) -> dict:
    """Gemini 응답에서 마크다운 코드 블록 등을 제거하고 순수 JSON 딕셔너리로 안전하게 파싱"""
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 혹시 JSON 앞뒤에 부가 텍스트가 섞여있을 경우 중괄호 매칭
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise

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

@app.route("/api/extract-url", methods=["POST"])
def extract_url():
    """웹페이지 링크(URL)에서 핵심 텍스트를 스크랩하여 추출"""
    data = request.get_json() or {}
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"success": False, "error": "URL 주소를 입력해 주세요."}), 400

    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        # dongwonlab.com 특화 처리: API를 통해 1~5주차 실시간 퀴즈 15문항 직접 추출
        if "dongwonlab.com" in url:
            try:
                api_resp = requests.get("http://dongwonlab.com/api/courses", headers=headers, timeout=10)
                if api_resp.status_code == 200:
                    api_data = api_resp.json()
                    quizzes = api_data.get("active_quizzes", [])
                    if quizzes:
                        quiz_blocks = []
                        for idx, q in enumerate(quizzes, 1):
                            course = q.get("course", "원가회계")
                            session = q.get("session", "")
                            quest = q.get("question", "")
                            options = q.get("options", [])
                            opt_str = "\n".join([f"  {i+1}. {opt}" for i, opt in enumerate(options)])
                            quiz_blocks.append(
                                f"[동원랩 실시간 퀴즈 {idx}] ({course} - {session})\n문제: {quest}\n선택지:\n{opt_str}"
                            )
                        
                        full_dongwon_text = "\n\n".join(quiz_blocks)
                        logging.info(f"🎯 dongwonlab.com 퀴즈 {len(quizzes)}개 특화 추출 성공!")
                        return jsonify({
                            "success": True,
                            "is_dongwonlab": True,
                            "target_field": "practice_problems",
                            "subject": "원가회계 (1~5주차 교수님 퀴즈 족보)",
                            "title": f"동원랩 실시간 퀴즈 족보 (총 {len(quizzes)}문항)",
                            "text": full_dongwon_text
                        })
            except Exception as e:
                logging.warning(f"dongwonlab API 추출 시도 중 예외: {e}")

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

        if not lecture_notes and not practice_problems:
            return jsonify({"success": False, "error": "강의 자료 내용이나 교수님 연습문제를 하나 이상 입력해 주세요."}), 400

        logging.info(f"📝 시험 생성 요청: 과목={subject_name}, 모드={mode}, 문항수={question_count}, 제한시간={time_limit_minutes}분, 유형={question_types}")

        prompt = f"""
당신은 대학교 강의와 시험 출제 전문가이자 수석 출제위원입니다.
학생이 제공한 '교수님 강의 자료'와 '교수님 학생참여 웹 이론 연습문제'를 정밀 분석하여, 실제 대학교 중간고사 시험에 출제될 확률이 매우 높은 실전 모의고사 {question_count}문항을 생성해 주세요.

[입력된 과목명]
{subject_name}

[출제 모드]
{"🎯 족보 적중 모드: 교수님의 참여 웹 연습문제와 예제를 바탕으로, 원래 문제의 핵심 개념을 그대로 출제하거나 보기를 변형/반대 상황을 묻는 '기출 쌍둥이 변형 문제'를 최우선으로 다수 출제하세요." if mode == "hit_focus" else "📚 개념 심화 모드: 강의 자료 전체의 이론, 정의, 핵심 원리를 골고루 다루어 빈틈없이 대비할 수 있도록 출제하세요."}

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
   - 헷갈리기 쉬운 함정 보기와 교수님이 자주 짚는 개념을 반영하세요.
2. 주관식(subjective):
   - options는 빈 배열 []로 둡니다.
   - 질문은 단답형으로 떨어질 수 있게 명확해야 합니다 (예: "~하는 기법의 명칭은 무엇인가?", "~에 들어갈 핵심 용어를 쓰시오").
   - correct_answer는 대표 모범 정답입니다.
   - keywords에는 대소문자, 한글/영문 표기 차이 등을 감안하여 채점에 필요한 핵심 키워드 리스트를 2~4개 작성하세요 (예: ["객체지향", "OOP", "Object-Oriented"]).
3. explanation(해설):
   - 왜 이것이 정답이고, 다른 보기가 왜 오답인지 중학생도 이해할 수 있게 친절하고 명쾌하게 설명합니다.
   - "시험 꿀팁"을 한 줄 덧붙여주세요.
4. source_tag:
   - 이 문제가 어디서 유래했는지 표기합니다 (예: "교수님 참여웹 3강 연습문제 변형", "강의 슬라이드 2장 핵심 정의").

반드시 아래 JSON 형식으로만 응답하세요. 백틱(`) 마크다운 코드블록이나 불필요한 설명 없이 순수 JSON 텍스트만 출력하세요:
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
      "options": [
        "1. 보기 내용",
        "2. 보기 내용",
        "3. 보기 내용",
        "4. 보기 내용"
      ],
      "correct_answer": "1. 보기 내용",
      "keywords": [],
      "explanation": "정답 해설 및 시험 꿀팁...",
      "source_tag": "교수님 참여웹 연습문제 변형",
      "difficulty": "중"
    }}
  ]
}}
"""

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json"
            )
        )

        exam_data = clean_json_response(response.text)
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
