// ==========================================================================
// AI 중간고사 족보 & 실전 모의시험 마스터 Frontend Script
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. 상태 변수 관리
    let currentExam = null;
    let userAnswers = {};
    let gradedResults = null;
    let timerInterval = null;
    let remainingSeconds = 0;
    let totalExamSeconds = 0;
    let timeSpentSeconds = 0;
    let isUnlimitedTime = false;

    // 2. DOM 요소 캐싱
    const setupView = document.getElementById("setupView");
    const examView = document.getElementById("examView");
    const resultsView = document.getElementById("resultsView");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingTitle = document.getElementById("loadingTitle");
    const loadingDesc = document.getElementById("loadingDesc");

    const setupForm = document.getElementById("setupForm");
    const loadSampleBtn = document.getElementById("loadSampleBtn");
    const subjectNameInput = document.getElementById("subjectName");
    const lectureNotesInput = document.getElementById("lectureNotes");
    const practiceProblemsInput = document.getElementById("practiceProblems");

    // 문항 수 및 시험 시간 맞춤 설정 요소
    const customQuestionCountInput = document.getElementById("customQuestionCount");
    const customTimeLimitInput = document.getElementById("customTimeLimit");
    const unlimitedTimeToggle = document.getElementById("unlimitedTimeToggle");
    const timeInputWrapper = document.getElementById("timeInputWrapper");
    const countPresetChips = document.querySelectorAll("#countPresetRow .preset-chip");
    const timePresetChips = document.querySelectorAll("#timePresetRow .preset-chip");
    const timePresetRow = document.getElementById("timePresetRow");
    const timeHintText = document.getElementById("timeHintText");
    const examDifficultySelect = document.getElementById("examDifficulty");

    const questionTypesSelect = document.getElementById("questionTypes");
    const modeRadios = document.querySelectorAll('input[name="mode"]');

    // PDF 및 URL 퀵 임포트 요소 (강의자료용)
    const pdfFileInput = document.getElementById("pdfFileInput");
    const toggleUrlBtn = document.getElementById("toggleUrlBtn");
    const urlInputRow = document.getElementById("urlInputRow");
    const webUrlInput = document.getElementById("webUrlInput");
    const fetchUrlBtn = document.getElementById("fetchUrlBtn");
    const importStatusPill = document.getElementById("importStatusPill");

    // 참여 웹(dongwonlab 등) 퀴즈 족보 퀵 임포트 요소
    const togglePracticeUrlBtn = document.getElementById("togglePracticeUrlBtn");
    const practiceUrlInputRow = document.getElementById("practiceUrlInputRow");
    const practiceWebUrlInput = document.getElementById("practiceWebUrlInput");
    const fetchPracticeUrlBtn = document.getElementById("fetchPracticeUrlBtn");
    const practiceImportStatusPill = document.getElementById("practiceImportStatusPill");

    // 시험 화면 요소
    const examSubjectPill = document.getElementById("examSubjectPill");
    const examTitleText = document.getElementById("examTitleText");
    const timerBox = document.getElementById("timerBox");
    const timerDisplay = document.getElementById("timerDisplay");
    const timerLabel = document.getElementById("timerLabel");
    const answeredProgressText = document.getElementById("answeredProgressText");
    const examProgressBar = document.getElementById("examProgressBar");
    const questionsContainer = document.getElementById("questionsContainer");
    const submitExamBtn = document.getElementById("submitExamBtn");
    const quitExamBtn = document.getElementById("quitExamBtn");

    // 결과 화면 요소
    const finalScore = document.getElementById("finalScore");
    const gradeBadge = document.getElementById("gradeBadge");
    const scoreStatsText = document.getElementById("scoreStatsText");
    const aiPrescriptionContent = document.getElementById("aiPrescriptionContent");
    const gradedReviewList = document.getElementById("gradedReviewList");
    const countAll = document.getElementById("countAll");
    const countWrong = document.getElementById("countWrong");
    const countCorrect = document.getElementById("countCorrect");
    const retryWrongOnlyBtn = document.getElementById("retryWrongOnlyBtn");
    const newExamBtn = document.getElementById("newExamBtn");
    const printExamBtn = document.getElementById("printExamBtn");
    const filterTabs = document.querySelectorAll(".tab-btn");

    // 3. 화면 전환 유틸리티
    function showView(viewName) {
        setupView.classList.remove("active");
        examView.classList.remove("active");
        resultsView.classList.remove("active");

        setupView.classList.add("hidden");
        examView.classList.add("hidden");
        resultsView.classList.add("hidden");

        if (viewName === "setup") {
            setupView.classList.add("active");
            setupView.classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (viewName === "exam") {
            examView.classList.add("active");
            examView.classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (viewName === "results") {
            resultsView.classList.add("active");
            resultsView.classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }

    function showLoading(title, desc) {
        loadingTitle.textContent = title || "처리 중입니다...";
        loadingDesc.textContent = desc || "잠시만 기다려 주세요.";
        loadingOverlay.classList.remove("hidden");
    }

    function hideLoading() {
        loadingOverlay.classList.add("hidden");
    }

    // 4. 라디오 버튼 UI 카드 토글
    modeRadios.forEach(radio => {
        radio.addEventListener("change", () => {
            document.querySelectorAll(".radio-card").forEach(c => c.classList.remove("active"));
            radio.closest(".radio-card").classList.add("active");
        });
    });

    // 4-0. 문항 수 및 시험 시간 자유 맞춤 설정 핸들러
    if (countPresetChips.length > 0) {
        countPresetChips.forEach(chip => {
            chip.addEventListener("click", () => {
                const count = parseInt(chip.dataset.count, 10);
                if (customQuestionCountInput) {
                    customQuestionCountInput.value = count;
                }
                updateCountChipActive(count);
                syncAutoTimeLimit();
            });
        });
    }

    if (customQuestionCountInput) {
        customQuestionCountInput.addEventListener("input", () => {
            let count = parseInt(customQuestionCountInput.value, 10);
            if (!isNaN(count)) {
                updateCountChipActive(count);
                syncAutoTimeLimit();
            }
        });
    }

    function updateCountChipActive(count) {
        countPresetChips.forEach(c => {
            if (parseInt(c.dataset.count, 10) === count) {
                c.classList.add("active");
            } else {
                c.classList.remove("active");
            }
        });
    }

    function syncAutoTimeLimit() {
        const autoChip = document.querySelector('#timePresetRow .preset-chip[data-time="auto"]');
        if (autoChip && autoChip.classList.contains("active") && !unlimitedTimeToggle.checked) {
            const count = parseInt(customQuestionCountInput.value, 10) || 10;
            const autoMins = Math.max(10, count * 2);
            if (customTimeLimitInput) customTimeLimitInput.value = autoMins;
            if (timeHintText) timeHintText.textContent = `문항 수(${count}문제)에 맞춰 1문제당 2분(${autoMins}분)으로 자동 계산되었습니다.`;
        }
    }

    if (timePresetChips.length > 0) {
        timePresetChips.forEach(chip => {
            chip.addEventListener("click", () => {
                if (unlimitedTimeToggle && unlimitedTimeToggle.checked) {
                    unlimitedTimeToggle.checked = false;
                    syncUnlimitedState();
                }

                timePresetChips.forEach(c => c.classList.remove("active"));
                chip.classList.add("active");

                const timeMode = chip.dataset.time;
                if (timeMode === "auto") {
                    syncAutoTimeLimit();
                } else {
                    const mins = parseInt(timeMode, 10);
                    if (customTimeLimitInput) customTimeLimitInput.value = mins;
                    if (timeHintText) timeHintText.textContent = `시험 시간이 ${mins}분으로 설정되었습니다.`;
                }
            });
        });
    }

    if (customTimeLimitInput) {
        customTimeLimitInput.addEventListener("input", () => {
            timePresetChips.forEach(c => c.classList.remove("active"));
            const mins = parseInt(customTimeLimitInput.value, 10);
            if (!isNaN(mins)) {
                timePresetChips.forEach(c => {
                    if (c.dataset.time === String(mins)) {
                        c.classList.add("active");
                    }
                });
                if (timeHintText) timeHintText.textContent = `시험 시간 ${mins}분 직접 입력됨`;
            }
        });
    }

    if (unlimitedTimeToggle) {
        unlimitedTimeToggle.addEventListener("change", syncUnlimitedState);
    }

    function syncUnlimitedState() {
        if (!unlimitedTimeToggle) return;
        if (unlimitedTimeToggle.checked) {
            if (timeInputWrapper) timeInputWrapper.classList.add("disabled");
            if (timePresetRow) timePresetRow.classList.add("disabled");
            if (timeHintText) timeHintText.textContent = "⏱️ 시간 제한 없음: 제한 시간 없이 여유롭게 공부하며 풀 수 있습니다.";
            timePresetChips.forEach(c => c.classList.remove("active"));
        } else {
            if (timeInputWrapper) timeInputWrapper.classList.remove("disabled");
            if (timePresetRow) timePresetRow.classList.remove("disabled");
            if (timeHintText) timeHintText.textContent = "직접 분 단위로 입력하거나 프리셋을 선택할 수 있습니다.";
            const mins = parseInt(customTimeLimitInput.value, 10) || 20;
            timePresetChips.forEach(c => {
                if (c.dataset.time === String(mins)) c.classList.add("active");
            });
        }
    }

    // 4-1. PDF 파일 자동 추출 핸들러 (브라우저 PDF.js 직접 추출 + 서버 폴백 이중 엔진)
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    async function extractPdfInBrowser(file, onProgress) {
        if (!window.pdfjsLib) {
            throw new Error("PDF.js 라이브러리가 로드되지 않았습니다.");
        }
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
            cMapPacked: true
        });
        const pdfDoc = await loadingTask.promise;
        const totalPages = pdfDoc.numPages;
        const extractedPages = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (onProgress && (pageNum === 1 || pageNum % 5 === 0 || pageNum === totalPages)) {
                onProgress(pageNum, totalPages);
            }
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            let lastY = null;
            let pageLines = [];
            let currentLine = "";

            for (const item of textContent.items) {
                const str = item.str || "";
                const y = item.transform ? Math.round(item.transform[5]) : null;
                if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
                    if (currentLine.trim()) pageLines.push(currentLine.trim());
                    currentLine = str;
                } else {
                    currentLine += (currentLine && !currentLine.endsWith(" ") && !str.startsWith(" ") ? " " : "") + str;
                }
                if (y !== null) lastY = y;
            }
            if (currentLine.trim()) pageLines.push(currentLine.trim());

            const cleaned = pageLines.join("\n").trim();
            if (cleaned) {
                extractedPages.push(`--- [페이지 ${pageNum}] ---\n${cleaned}`);
            }
        }

        const fullText = extractedPages.join("\n\n");
        if (!fullText.trim()) {
            throw new Error("PDF에서 텍스트를 추출할 수 없습니다. (스캔된 이미지 전용 PDF일 수 있습니다)");
        }
        return {
            filename: file.name,
            total_pages: totalPages,
            extracted_length: fullText.length,
            text: fullText
        };
    }

    if (pdfFileInput) {
        pdfFileInput.addEventListener("change", async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;

            let totalExtractedFiles = 0;
            let totalPagesSum = 0;
            let totalCharsSum = 0;

            try {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const prefix = files.length > 1 ? `(${i + 1}/${files.length}) ` : "";
                    showImportStatus(`📄 ${prefix}[${file.name}] PDF 텍스트 고속 추출 중...`, "loading");

                    let data = null;

                    // 1차: 브라우저 내장 PDF.js로 즉시 추출 (용량 제한 없음, 네트워크 업로드 지연 없음)
                    try {
                        data = await extractPdfInBrowser(file, (curPage, maxPage) => {
                            showImportStatus(`📄 ${prefix}[${file.name}] 분석 중... (${curPage} / ${maxPage} 페이지)`, "loading");
                        });
                    } catch (clientErr) {
                        console.warn("브라우저 PDF 추출 폴백 -> 서버 API 시도:", clientErr);
                        // 스캔본 에러는 바로 표시
                        if (clientErr.message && clientErr.message.includes("스캔된 이미지")) {
                            throw clientErr;
                        }
                        // 2차 폴백: 서버 /api/extract-pdf 호출
                        const formData = new FormData();
                        formData.append("file", file);
                        const resp = await fetch("/api/extract-pdf", {
                            method: "POST",
                            body: formData
                        });
                        const serverData = await resp.json();
                        if (!resp.ok || !serverData.success) {
                            throw new Error(serverData.error || "PDF 추출 실패");
                        }
                        data = serverData;
                    }

                    if (lectureNotesInput.value.trim()) {
                        lectureNotesInput.value += `\n\n[추가 첨부: ${data.filename} (${data.total_pages}페이지)]\n` + data.text;
                    } else {
                        lectureNotesInput.value = `[첨부: ${data.filename} (${data.total_pages}페이지)]\n` + data.text;
                    }

                    totalExtractedFiles++;
                    totalPagesSum += data.total_pages;
                    totalCharsSum += data.extracted_length;
                }

                if (totalExtractedFiles === 1) {
                    showImportStatus(`✅ PDF 추출 성공! (${files[0].name}, 총 ${totalPagesSum}페이지, 약 ${totalCharsSum.toLocaleString()}자)`, "success");
                } else {
                    showImportStatus(`✅ PDF ${totalExtractedFiles}개 추출 성공! (총 ${totalPagesSum}페이지, 약 ${totalCharsSum.toLocaleString()}자)`, "success");
                }
            } catch (err) {
                const msg = (err.message === "Failed to fetch")
                    ? "네트워크 연결 또는 대용량 파일 처리 중 오류가 발생했습니다. 페이지를 새로고침(Ctrl+F5) 후 다시 첨부해 주세요."
                    : err.message;
                showImportStatus(`❌ PDF 오류: ${msg}`, "error");
            } finally {
                pdfFileInput.value = "";
            }
        });
    }

    // 4-2. URL 토글 및 웹 링크 텍스트 추출 핸들러
    if (toggleUrlBtn && urlInputRow) {
        toggleUrlBtn.addEventListener("click", () => {
            urlInputRow.classList.toggle("hidden");
            if (!urlInputRow.classList.contains("hidden")) {
                webUrlInput.focus();
            }
        });
    }

    if (fetchUrlBtn && webUrlInput) {
        fetchUrlBtn.addEventListener("click", async () => {
            const url = webUrlInput.value.trim();
            if (!url) {
                alert("웹페이지 URL 주소를 입력해 주세요.");
                return;
            }

            fetchUrlBtn.disabled = true;
            fetchUrlBtn.textContent = "추출 중...";
            showImportStatus("🔗 웹페이지 연결 및 본문 스크랩 중...", "loading");

            try {
                const resp = await fetch("/api/extract-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: url })
                });
                const data = await resp.json();

                if (!resp.ok || !data.success) {
                    throw new Error(data.error || "웹페이지 추출 실패");
                }

                if (data.is_dongwonlab) {
                    if (practiceProblemsInput.value.trim()) {
                        practiceProblemsInput.value += `\n\n[웹 퀴즈 족보: ${data.title}]\n` + data.text;
                    } else {
                        practiceProblemsInput.value = `[웹 퀴즈 족보: ${data.title}]\n` + data.text;
                    }
                    if (data.subject && subjectNameInput) {
                        subjectNameInput.value = data.subject;
                    }
                    showImportStatus(`🎉 동원랩 1~5주차 퀴즈 15문항 족보 추출 성공! 족보 창에 자동 등록되었습니다.`, "success");
                } else {
                    if (lectureNotesInput.value.trim()) {
                        lectureNotesInput.value += `\n\n[웹 링크 추출: ${data.title}]\n` + data.text;
                    } else {
                        lectureNotesInput.value = `[웹 링크 추출: ${data.title}]\n` + data.text;
                    }
                    showImportStatus(`✅ 웹 링크 추출 완료! (${data.title})`, "success");
                }
                urlInputRow.classList.add("hidden");
                webUrlInput.value = "";
            } catch (err) {
                showImportStatus(`❌ 웹 링크 오류: ${err.message}`, "error");
            } finally {
                fetchUrlBtn.disabled = false;
                fetchUrlBtn.textContent = "본문 추출";
            }
        });
    }

    // 4-3. 참여 웹 퀴즈 족보 링크 추출 핸들러 (dongwonlab.com 1~5주차 선택 지원)
    const dongwonWeekChips = document.querySelectorAll("#dongwonWeekChips .week-chip");

    function getSelectedDongwonWeeks() {
        const allChip = document.querySelector('#dongwonWeekChips .week-chip[data-week="all"]');
        if (!dongwonWeekChips.length || (allChip && allChip.classList.contains("active"))) {
            return ["all"];
        }
        const selected = [];
        dongwonWeekChips.forEach(chip => {
            if (chip.dataset.week !== "all" && chip.classList.contains("active")) {
                selected.push(chip.dataset.week);
            }
        });
        return selected.length > 0 ? selected : ["all"];
    }

    if (dongwonWeekChips.length > 0) {
        const allChip = document.querySelector('#dongwonWeekChips .week-chip[data-week="all"]');
        const indivChips = Array.from(dongwonWeekChips).filter(c => c.dataset.week !== "all");

        dongwonWeekChips.forEach(chip => {
            chip.addEventListener("click", () => {
                if (chip.dataset.week === "all") {
                    indivChips.forEach(c => c.classList.remove("active"));
                    allChip.classList.add("active");
                } else {
                    if (allChip) allChip.classList.remove("active");
                    chip.classList.toggle("active");

                    const activeIndiv = indivChips.filter(c => c.classList.contains("active"));
                    if (activeIndiv.length === 0 || activeIndiv.length === indivChips.length) {
                        indivChips.forEach(c => c.classList.remove("active"));
                        if (allChip) allChip.classList.add("active");
                    }
                }
            });
        });
    }

    if (togglePracticeUrlBtn && practiceUrlInputRow) {
        togglePracticeUrlBtn.addEventListener("click", () => {
            practiceUrlInputRow.classList.toggle("hidden");
            if (!practiceUrlInputRow.classList.contains("hidden")) {
                if (!practiceWebUrlInput.value.trim()) {
                    practiceWebUrlInput.value = "http://dongwonlab.com";
                }
            }
        });
    }

    if (fetchPracticeUrlBtn && practiceWebUrlInput) {
        fetchPracticeUrlBtn.addEventListener("click", async () => {
            const url = practiceWebUrlInput.value.trim() || "http://dongwonlab.com";
            const selectedWeeks = getSelectedDongwonWeeks();

            fetchPracticeUrlBtn.disabled = true;
            fetchPracticeUrlBtn.textContent = "추출 중...";
            showPracticeImportStatus("🔗 동원랩 퀴즈 족보 데이터 불러오는 중...", "loading");

            try {
                const resp = await fetch("/api/extract-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url: url,
                        weeks: selectedWeeks
                    })
                });
                const data = await resp.json();

                if (!resp.ok || !data.success) {
                    throw new Error(data.error || "퀴즈 족보 추출 실패");
                }

                // 기존에 추출된 동원랩 족보가 있으면 선택한 주차 내용으로 깔끔하게 교체
                const currentText = practiceProblemsInput.value.trim();
                if (!currentText || currentText.startsWith("[추출 족보:") || currentText.startsWith("[웹 퀴즈 족보:")) {
                    practiceProblemsInput.value = `[추출 족보: ${data.title}]\n` + data.text;
                } else {
                    practiceProblemsInput.value = currentText + `\n\n[추출 족보: ${data.title}]\n` + data.text;
                }

                if (data.subject && subjectNameInput) {
                    subjectNameInput.value = data.subject;
                }

                // 족보 적중 모드 자동 선택
                const hitFocusRadio = document.querySelector('input[name="mode"][value="hit_focus"]');
                if (hitFocusRadio) {
                    hitFocusRadio.checked = true;
                    document.querySelectorAll(".radio-card").forEach(c => c.classList.remove("active"));
                    hitFocusRadio.closest(".radio-card").classList.add("active");
                }

                showPracticeImportStatus(`🎉 ${data.title} 추출 완료! 다른 주차를 선택해 다시 누르면 해당 주차로 변경됩니다.`, "success");
            } catch (err) {
                showPracticeImportStatus(`❌ 족보 추출 오류: ${err.message}`, "error");
            } finally {
                fetchPracticeUrlBtn.disabled = false;
                fetchPracticeUrlBtn.textContent = "선택 주차 족보 추출";
            }
        });
    }

    function showPracticeImportStatus(msg, type) {
        if (!practiceImportStatusPill) return;
        practiceImportStatusPill.textContent = msg;
        practiceImportStatusPill.className = `import-status-pill ${type}`;
        practiceImportStatusPill.classList.remove("hidden");
        if (type === "success") {
            setTimeout(() => {
                practiceImportStatusPill.classList.add("hidden");
            }, 6000);
        }
    }

    function showImportStatus(msg, type) {
        if (!importStatusPill) return;
        importStatusPill.textContent = msg;
        importStatusPill.className = `import-status-pill ${type}`;
        importStatusPill.classList.remove("hidden");
        if (type === "success") {
            setTimeout(() => {
                importStatusPill.classList.add("hidden");
            }, 6000);
        }
    }

    // 5. [체험용 샘플 데이터 자동 채우기] 버튼
    loadSampleBtn.addEventListener("click", () => {
        subjectNameInput.value = "컴퓨터 구조 및 운영체제 (중간고사)";
        
        lectureNotesInput.value = `[1장: 컴퓨터 시스템의 구조]
- 컴퓨터의 기본 하드웨어는 CPU(중앙처리장치), 주기억장치(RAM/ROM), 보조기억장치(SSD/HDD), 입출력장치로 구성된다.
- 폰 노이만 구조의 특징: 프로그램 내장 방식(Stored-program concept)으로 명령어와 데이터가 동일한 메모리에 적재되어 순차적으로 실행된다.
- CPU의 3대 핵심 구성요소:
  1) ALU(산술논리연산장치): 덧셈, 뺄셈, AND, OR 등 연산 수행
  2) 제어장치(Control Unit): 명령어를 해독하고 시스템 각 장치에 제어 신호를 보냄
  3) 레지스터(Register): CPU 내부의 초고속 임시 기억장치 (PC, IR, MAR, MBR 등)

[2장: 메모리 계층 구조 및 캐시 메모리]
- 속도: 레지스터 > L1/L2/L3 캐시 > 주기억장치(RAM) > 보조기억장치(SSD/HDD)
- 지역성의 원리(Locality):
  1) 시간 지역성(Temporal Locality): 최근에 참조된 데이터는 가까운 미래에 다시 참조될 가능성이 높음 (반복문 등)
  2) 공간 지역성(Spatial Locality): 특정 메모리가 참조되면 인접한 메모리 위치도 곧 참조될 가능성이 높음 (배열 등)
- 캐시 사상(Mapping) 방식: 직접 사상(Direct), 연관 사상(Associative), 세트 연관 사상(Set-Associative)`;

        practiceProblemsInput.value = `[학생참여 웹 연습문제 1]
문제: CPU 내부에서 다음번에 인출(Fetch)하여 실행할 명령어의 주소를 보관하는 레지스터의 명칭은 무엇인가?
정답: 프로그램 카운터 (PC, Program Counter)
해설: PC는 순차적으로 실행될 명령어의 주소를 가리킵니다.

[학생참여 웹 연습문제 2]
문제: 다음 중 전원이 꺼져도 데이터가 보존되는 비휘발성 메모리로 옳은 것은?
1. SRAM
2. DRAM
3. ROM
4. 레지스터
정답: 3. ROM
해설: ROM과 플래시 메모리는 비휘발성이며, SRAM과 DRAM은 전원이 차단되면 데이터가 소멸되는 휘발성 메모리입니다.

[학생참여 웹 연습문제 3]
문제: 캐시 메모리의 사상(Mapping) 방식 중 태그 충돌(Conflict Miss)이 가장 적게 발생하지만 하드웨어 구조가 가장 복잡한 방식은 무엇인가?
정답: 완전 연관 사상 (Fully Associative Mapping)
해설: 완전 연관 사상은 어느 캐시 블록에나 자유롭게 배치될 수 있어 충돌이 가장 적습니다.`;

        // 문항 수 및 시간 기본값 리셋
        if (customQuestionCountInput) customQuestionCountInput.value = 10;
        if (customTimeLimitInput) customTimeLimitInput.value = 20;
        if (unlimitedTimeToggle) {
            unlimitedTimeToggle.checked = false;
            syncUnlimitedState();
        }
        updateCountChipActive(10);

        // 피드백 애니메이션
        loadSampleBtn.style.background = "rgba(16, 185, 129, 0.25)";
        loadSampleBtn.style.color = "#34d399";
        loadSampleBtn.innerHTML = "<span>✅ 1~2강 핵심 요약 및 족보 연습문제 입력 완료!</span>";
        setTimeout(() => {
            loadSampleBtn.style.background = "";
            loadSampleBtn.style.color = "";
            loadSampleBtn.innerHTML = "<span>💡 예제 자료로 1초 만에 체험해보기</span>";
        }, 2500);
    });

    // 6. 시험 생성 폼 제출 핸들러
    setupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const lectureNotes = lectureNotesInput.value.trim();
        const practiceProblems = practiceProblemsInput.value.trim();
        const subjectName = subjectNameInput.value.trim() || "중간고사 모의평가";
        const selectedMode = document.querySelector('input[name="mode"]:checked').value;
        const questionTypes = questionTypesSelect.value;
        const difficulty = examDifficultySelect ? examDifficultySelect.value : "hard";

        // 사용자가 자유롭게 입력한 문항 수 (기본 10, 범위 1~50)
        let questionCount = parseInt(customQuestionCountInput ? customQuestionCountInput.value : 10, 10);
        if (isNaN(questionCount) || questionCount < 1) questionCount = 10;
        if (questionCount > 50) questionCount = 50;
        if (customQuestionCountInput) customQuestionCountInput.value = questionCount;

        // 사용자가 자유롭게 입력한 시험 시간 (0이면 무제한 모드)
        let timeLimitMinutes = 0;
        if (!unlimitedTimeToggle || !unlimitedTimeToggle.checked) {
            timeLimitMinutes = parseInt(customTimeLimitInput ? customTimeLimitInput.value : 20, 10);
            if (isNaN(timeLimitMinutes) || timeLimitMinutes < 1) {
                timeLimitMinutes = Math.max(10, questionCount * 2);
            }
        }

        if (!lectureNotes && !practiceProblems) {
            alert("강의 자료 요약이나 학생참여 웹 연습문제를 하나 이상 입력해 주세요!");
            return;
        }

        const diffLabel = (difficulty === "hard") ? "🔥실전 대학시험(킬러 계산)" : (difficulty === "standard" ? "📚표준 중간고사" : "🌱기본 점검");
        const timeMsg = (timeLimitMinutes === 0) ? "무제한 연습 모드" : `${timeLimitMinutes}분 제한`;
        showLoading(
            "AI 수석 출제위원이 고난도 실전 시험 문제를 출제하고 있습니다...",
            `[${subjectName}] ${diffLabel} | ${questionCount}문항 (${timeMsg}) 다단계 계산 및 핵심 이론 모의고사를 구성 중입니다.`
        );

        // 대용량 PDF 텍스트(5만 자 초과)의 경우 전 범위를 균등 샘플링하여 전송 용량 및 AI 응답 속도 최적화
        let optimizedLectureNotes = lectureNotes;
        const MAX_NOTES_CHARS = 50000;
        if (optimizedLectureNotes.length > MAX_NOTES_CHARS) {
            const chunks = optimizedLectureNotes.split(/(?=--- \[페이지 \d+\] ---)/);
            if (chunks.length > 10) {
                const step = Math.max(1, Math.ceil(chunks.length / 80));
                const sampled = chunks.filter((_, idx) => idx % step === 0);
                optimizedLectureNotes = sampled.join("\n").slice(0, MAX_NOTES_CHARS);
            } else {
                optimizedLectureNotes = optimizedLectureNotes.slice(0, MAX_NOTES_CHARS);
            }
        }

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lecture_notes: optimizedLectureNotes,
                    practice_problems: practiceProblems,
                    subject_name: subjectName,
                    mode: selectedMode,
                    difficulty: difficulty,
                    question_count: questionCount,
                    time_limit_minutes: timeLimitMinutes,
                    question_types: questionTypes
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || "시험 생성에 실패했습니다.");
            }

            currentExam = data.exam;
            userAnswers = {};
            startExamSession(currentExam);

        } catch (err) {
            alert(`오류 발생: ${err.message}`);
        } finally {
            hideLoading();
        }
    });

    // 동원랩 1~5주차 14문항 클라이언트 정답 무결성 검증 테이블
    const DONGWONLAB_CLIENT_TRUTH = [
        { q: "옳은 것은?", optKey: "비용은 특정 자원을 위해", ansIdx: 2, exp: "정답 3번 (해설: 3번 '원가대상은 원가를 계산하고 집계하는 단위이다.'가 옳은 설명입니다. 1번은 원가, 2번은 비용의 정의이며, 4번 재료원가·노무원가·제조경비의 합은 제조원가입니다.)" },
        { q: "다음 중 틀린 것은?", optKey: "활동에 따라 제조원가와", ansIdx: 3, exp: "정답 4번 (해설: 4번이 틀린 문장입니다. 재무회계는 외부정보이용자 보고 목적이며, 관리회계가 내부 의사결정 목적입니다.)" },
        { q: "의사결정에 영향을 미치는 원가가 아닌 것은", optKey: "기발생원가", ansIdx: 1, exp: "정답 2번 (해설: 2번 '기발생원가'(매몰원가)는 과거에 이미 발생한 원가로 미래 의사결정에 영향을 미치지 않는 비관련원가입니다.)" },
        { q: "제조원가명세서에 관한 설명으로 틀린 것은", optKey: "기말재공품을 더하고 기초재공품을 차감", ansIdx: 2, exp: "정답 3번 (해설: 3번이 틀린 문장입니다. 당기총제조원가에 기초재공품을 더하고 기말재공품을 차감해야 당기제품제조원가가 됩니다.)" },
        { q: "다음 중 틀린 것은?", optKey: "상장기업에는 공시 의무가 있다", ansIdx: 2, exp: "정답 3번 (해설: 3번이 틀린 문장입니다. K-IFRS에서 제조원가명세서는 의무 공시 재무제표가 아닙니다.)" },
        { q: "개별원가계산에 관한 설명으로 옳지 않은 것은", optKey: "실제원가계산이나 정상원가계산과 함께", ansIdx: 3, exp: "정답 4번 (해설: 4번이 틀린 문장입니다. 개별원가계산은 원가의 집계 방법에 따른 분류이며, 원가의 측정 방법인 실제원가계산·정상원가계산과 결합하여 함께 적용할 수 있습니다.)" },
        { q: "배부기준 선정기준에 대한 내용이다. 틀린 것은", optKey: "인과관계기준이 가장 타당하여", ansIdx: 0, exp: "정답 1번 (해설: 1번이 틀린 문장입니다. 인과관계기준을 가장 우선 적용하며, 인과관계를 찾기 어려울 때 보완적으로 적용하는 기준은 수혜기준·부담능력기준입니다.)" },
        { q: "실제개별원가계산에 관한 설명으로 옳지 않은 것은", optKey: "1개월 단위로 계산하면", ansIdx: 2, exp: "정답 3번 (해설: 3번이 틀린 문장입니다. 실제배부율을 1개월 단위로 계산하면 계절적 요인과 조업도 변동으로 월별 배부율이 크게 변동하여 비교가 어렵습니다.)" },
        { q: "정상원가계산에 관한 설명으로 옳지 않은 것은", optKey: "예상 배부기준량에 예정배부율을 곱하여", ansIdx: 2, exp: "정답 3번 (해설: 3번이 틀린 문장입니다! 정상원가계산에서 각 작업에 배부할 제조간접원가는 '예상 배부기준량'이 아니라 '실제 배부기준량'에 예정배부율을 곱하여 계산합니다. 4번 적시성 설명은 옳은 문장입니다.)" },
        { q: "제조간접원가 배부차이에 관한 설명으로 옳은 것은", optKey: "과소배부가 발생한 경우", ansIdx: 2, exp: "정답 3번 (해설: 3번이 옳은 문장입니다! 과소배부(예정배부액 < 실제발생액)는 원가가 실제보다 과소계산된 상태이므로, 배부차이를 조정하면 재고자산과 매출원가가 상향조정(가산)됩니다. 2번 과대배부는 과대계산된 상태이므로 틀린 문장입니다.)" },
        { q: "제조간접원가 배부차이의 조정 방법에 관한 설명으로 옳지 않은 것은", optKey: "조정되는 배부차이 총액이 달라짐", ansIdx: 3, exp: "정답 4번 (해설: 4번이 틀린 문장입니다. 어떤 조정 방법을 택하더라도 재공품·제품·매출원가 전체에서 조정되는 배부차이 총액은 항상 동일합니다.)" },
        { q: "종합원가계산에 관한 설명으로 옳지 않은 것은", optKey: "직접재료가 공정 초기에 전량 투입", ansIdx: 2, exp: "정답 3번 (해설: 3번이 틀린 문장입니다. 직접재료가 공정 초기에 전량 투입되면 기말재공품의 직접재료원가 완성도는 100%가 되므로 가공원가 완성도와 다릅니다.)" },
        { q: "가중평균법과 선입선출법에 관한 설명으로 옳은 것은", optKey: "기초재공품이 없는 경우", ansIdx: 1, exp: "정답 2번 (해설: 2번이 옳은 문장입니다. 기초재공품이 없는 경우에는 가중평균법과 선입선출법으로 계산한 완성품원가와 기말재공품원가가 서로 완전히 동일합니다.)" },
        { q: "제조원가가 계속 상승하는 상황에서 가중평균법과 선입선출법을 비교한 설명으로 옳지 않은 것은", optKey: "매출총이익과 법인세는 선입선출법이", ansIdx: 3, exp: "정답 4번 (해설: 4번이 틀린 문장입니다. 원가 상승 시 선입선출법은 기말재공품원가가 크고 매출원가가 가중평균법보다 작으므로, 매출총이익과 법인세는 선입선출법이 가중평균법보다 큽니다.)" }
    ];

    function enforceDongwonlabAnswersClient(questions) {
        if (!Array.isArray(questions)) return;
        questions.forEach(q => {
            if (!q.options || q.options.length < 4) return;
            const qTitle = String(q.question || "").trim();
            const optsJoined = q.options.join(" ");
            for (const rule of DONGWONLAB_CLIENT_TRUTH) {
                if (qTitle.includes(rule.q) && optsJoined.includes(rule.optKey)) {
                    if (q.options[rule.ansIdx]) {
                        q.correct_answer = q.options[rule.ansIdx];
                        q.explanation = `[검증된 동원랩 족보 정석 해설] ${rule.exp}`;
                    }
                    break;
                }
            }
        });
    }

    // 7. 실전 시험 세션 시작
    function startExamSession(exam) {
        if (exam && exam.questions) {
            enforceDongwonlabAnswersClient(exam.questions);
        }
        examSubjectPill.textContent = exam.subject || "중간고사";
        examTitleText.textContent = exam.exam_title || "실전 모의고사";
        
        // 시간 설정 (0: 무제한 모드)
        const limitMinutes = (typeof exam.time_limit_minutes === "number") ? exam.time_limit_minutes : 20;
        isUnlimitedTime = (limitMinutes <= 0);

        if (isUnlimitedTime) {
            totalExamSeconds = 0;
            remainingSeconds = 0;
            timeSpentSeconds = 0;
            if (timerLabel) timerLabel.textContent = "⏱️ 경과 시간 (무제한)";
        } else {
            totalExamSeconds = limitMinutes * 60;
            remainingSeconds = totalExamSeconds;
            timeSpentSeconds = 0;
            if (timerLabel) timerLabel.textContent = "⏱️ 남은 시간";
        }

        renderQuestions(exam.questions);
        startTimer();
        updateExamProgress();
        showView("exam");
    }

    // 8. 문제 렌더링
    function renderQuestions(questions) {
        questionsContainer.innerHTML = "";

        questions.forEach((q, idx) => {
            const card = document.createElement("div");
            card.className = "q-card";
            card.id = `qCard_${q.id}`;

            const isMultiple = (q.type === "multiple_choice");
            const typeLabel = isMultiple ? "객관식" : "주관식 단답형";
            const sourceBadge = q.source_tag ? `<span class="q-source-tag">🎯 ${q.source_tag}</span>` : "";

            let questionBodyHtml = "";

            if (q.code_snippet) {
                questionBodyHtml += `<pre class="q-code-snippet"><code>${escapeHtml(q.code_snippet)}</code></pre>`;
            }

            if (isMultiple && q.options && q.options.length > 0) {
                // 객관식 4~5지선다
                const optionsHtml = q.options.map((opt, optIdx) => {
                    const isSelected = (userAnswers[q.id] === opt);
                    return `
                        <button type="button" class="option-choice-btn ${isSelected ? 'selected' : ''}" data-qid="${q.id}" data-val="${escapeHtml(opt)}">
                            <span class="choice-marker">${optIdx + 1}</span>
                            <span class="choice-text">${escapeHtml(opt)}</span>
                        </button>
                    `;
                }).join("");

                questionBodyHtml += `<div class="options-list">${optionsHtml}</div>`;
            } else {
                // 주관식 단답형
                const currentVal = userAnswers[q.id] || "";
                questionBodyHtml += `
                    <div class="subjective-input-box">
                        <input type="text" class="subjective-input" data-qid="${q.id}" placeholder="정답 키워드 또는 용어를 입력하세요..." value="${escapeHtml(currentVal)}">
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="q-card-header">
                    <div class="q-num-wrap">
                        <span class="q-badge">Q${idx + 1}</span>
                        <span class="q-type-pill">${typeLabel}</span>
                    </div>
                    ${sourceBadge}
                </div>
                <h3 class="q-title">${escapeHtml(q.question)}</h3>
                ${questionBodyHtml}
            `;

            questionsContainer.appendChild(card);
        });

        // 객관식 선택 이벤트 리스너 등록
        document.querySelectorAll(".option-choice-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const qid = btn.getAttribute("data-qid");
                const val = btn.getAttribute("data-val");

                // 같은 카드의 다른 버튼 선택 해제
                const parent = btn.closest(".options-list");
                parent.querySelectorAll(".option-choice-btn").forEach(b => b.classList.remove("selected"));

                btn.classList.add("selected");
                userAnswers[qid] = val;

                // 카드 상태 업데이트
                document.getElementById(`qCard_${qid}`).classList.add("answered");
                updateExamProgress();
            });
        });

        // 주관식 입력 이벤트 리스너 등록
        document.querySelectorAll(".subjective-input").forEach(input => {
            input.addEventListener("input", () => {
                const qid = input.getAttribute("data-qid");
                const val = input.value.trim();

                if (val) {
                    userAnswers[qid] = val;
                    document.getElementById(`qCard_${qid}`).classList.add("answered");
                } else {
                    delete userAnswers[qid];
                    document.getElementById(`qCard_${qid}`).classList.remove("answered");
                }
                updateExamProgress();
            });
        });
    }

    // 9. 프로그레스 바 및 응답 개수 갱신
    function updateExamProgress() {
        if (!currentExam) return;
        const total = currentExam.questions.length;
        const answeredCount = Object.keys(userAnswers).length;
        const percentage = Math.round((answeredCount / total) * 100);

        answeredProgressText.textContent = `${answeredCount} / ${total} 완료 (${percentage}%)`;
        examProgressBar.style.width = `${percentage}%`;
    }

    // 10. 타이머 관리
    function startTimer() {
        clearInterval(timerInterval);
        timerBox.classList.remove("warning");

        function updateDisplay() {
            if (isUnlimitedTime) {
                const mins = Math.floor(timeSpentSeconds / 60);
                const secs = timeSpentSeconds % 60;
                timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            } else {
                const mins = Math.floor(remainingSeconds / 60);
                const secs = remainingSeconds % 60;
                timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                if (remainingSeconds <= 180) { // 3분 미만
                    timerBox.classList.add("warning");
                }
            }
        }

        updateDisplay();

        timerInterval = setInterval(() => {
            timeSpentSeconds++;

            if (!isUnlimitedTime) {
                remainingSeconds--;
                updateDisplay();

                if (remainingSeconds <= 0) {
                    clearInterval(timerInterval);
                    alert("⏱️ 시험 시간이 종료되었습니다! 작성하신 답안을 자동으로 제출합니다.");
                    submitExamAnswers();
                }
            } else {
                updateDisplay();
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    // 11. 시험 중단 / 제출 핸들러
    quitExamBtn.addEventListener("click", () => {
        if (confirm("시험을 중단하고 처음 화면으로 돌아가시겠습니까? 작성 중인 답안은 저장되지 않습니다.")) {
            stopTimer();
            showView("setup");
        }
    });

    submitExamBtn.addEventListener("click", () => {
        if (!currentExam) return;
        const total = currentExam.questions.length;
        const answeredCount = Object.keys(userAnswers).length;

        if (answeredCount < total) {
            const unanswered = total - answeredCount;
            if (!confirm(`아직 풀지 않은 문제가 ${unanswered}개 있습니다.\n그래도 답안을 최종 제출하고 채점하시겠습니까?`)) {
                return;
            }
        } else {
            if (!confirm("모든 문제에 답안을 작성하셨습니다.\n최종 제출하고 채점하시겠습니까?")) {
                return;
            }
        }

        submitExamAnswers();
    });

    // 12. 답안 즉시 채점 (0.05초 초고속 로컬 채점 엔진 - 네트워크 지연 및 3분 대기 원천 제거)
    async function submitExamAnswers() {
        stopTimer();
        if (!currentExam || !currentExam.questions) return;

        const questions = currentExam.questions;
        enforceDongwonlabAnswersClient(questions);
        const totalQuestions = questions.length;
        const pointPerQ = Math.round((100.0 / totalQuestions) * 10) / 10;
        let correctCount = 0;
        const gradedQuestions = [];

        questions.forEach(q => {
            const qid = String(q.id);
            const qType = q.type || "multiple_choice";
            const correctAns = String(q.correct_answer || "").trim();
            const userAns = String(userAnswers[qid] || "").trim();
            const keywords = Array.isArray(q.keywords) ? q.keywords : [];

            let isCorrect = false;
            let earnedPoints = 0;

            if (qType === "multiple_choice") {
                if (userAns && (userAns === correctAns || (correctAns.length >= 2 && userAns.slice(0, 2) === correctAns.slice(0, 2)))) {
                    isCorrect = true;
                    earnedPoints = pointPerQ;
                    correctCount++;
                }
            } else {
                const normUser = userAns.toLowerCase().replace(/\s+/g, "");
                const normCorrect = correctAns.toLowerCase().replace(/\s+/g, "");
                if (normUser && (normUser === normCorrect || keywords.some(kw => kw && normUser.includes(String(kw).toLowerCase().replace(/\s+/g, ""))))) {
                    isCorrect = true;
                    earnedPoints = pointPerQ;
                    correctCount++;
                }
            }

            gradedQuestions.push({
                id: q.id,
                type: qType,
                question: q.question,
                code_snippet: q.code_snippet || "",
                options: q.options || [],
                user_answer: userAns ? userAns : "(미응답)",
                correct_answer: correctAns,
                is_correct: isCorrect,
                explanation: q.explanation || "",
                source_tag: q.source_tag || "",
                difficulty: q.difficulty || "보통",
                earned_points: earnedPoints
            });
        });

        const score = Math.round((correctCount / totalQuestions) * 100);
        let grade = "F";
        if (score >= 95) grade = "A+";
        else if (score >= 90) grade = "A0";
        else if (score >= 85) grade = "B+";
        else if (score >= 80) grade = "B0";
        else if (score >= 75) grade = "C+";
        else if (score >= 70) grade = "C0";
        else if (score >= 60) grade = "D";

        const wrongItems = gradedQuestions.filter(g => !g.is_correct);
        let aiPrescription = "";
        if (wrongItems.length === 0) {
            aiPrescription = `🎉 완벽합니다! 총 ${totalQuestions}문항을 모두 맞혀 100점(${grade})을 달성하셨습니다. 개념 이해와 다단계 계산 응용력이 모두 실전 중간고사 만점 수준입니다. 전체 문항의 핵심 해설과 시험 꿀팁만 가볍게 1회독 점검하시고 자신감 있게 시험장에 입장하세요!`;
        } else {
            const weakTags = [];
            wrongItems.forEach(w => {
                const tag = (w.source_tag || "").trim();
                if (tag && !weakTags.includes(tag)) weakTags.push(tag);
            });
            const tagSummary = weakTags.length > 0 ? weakTags.slice(0, 4).join(", ") : "핵심 개념 및 계산 응용";
            aiPrescription = `총 ${totalQuestions}문항 중 ${correctCount}문항 정답(${score}점, ${grade} 등급)을 기록하셨습니다! 집중 보완이 필요한 취약 영역은 [${tagSummary}] 파트(오답 ${wrongItems.length}문항)입니다. 하단 '오답 노트' 탭을 눌러 틀린 문제의 [선지별 정·오답 분석]과 [단계별 계산 풀이]를 다시 풀어보시면 실제 시험에서 최소 15~20점 이상 즉시 상승할 수 있습니다!`;
        }

        gradedResults = {
            success: true,
            score: score,
            grade: grade,
            correct_count: correctCount,
            wrong_count: totalQuestions - correctCount,
            total_questions: totalQuestions,
            time_spent_seconds: timeSpentSeconds,
            graded_questions: gradedQuestions,
            ai_prescription: aiPrescription
        };

        hideLoading();
        displayResults(gradedResults);
    }

    // 13. 성적표 및 오답노트 결과 화면 렌더링
    function displayResults(results) {
        finalScore.textContent = results.score;
        gradeBadge.textContent = results.grade;

        // 등급별 뱃지 컬러 스타일링
        if (results.score >= 90) {
            gradeBadge.style.background = "linear-gradient(135deg, #10b981, #059669)";
        } else if (results.score >= 80) {
            gradeBadge.style.background = "linear-gradient(135deg, #6366f1, #38bdf8)";
        } else if (results.score >= 70) {
            gradeBadge.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
        } else {
            gradeBadge.style.background = "linear-gradient(135deg, #f43f5e, #e11d48)";
        }

        const mins = Math.floor(results.time_spent_seconds / 60);
        const secs = results.time_spent_seconds % 60;
        scoreStatsText.textContent = `총 ${results.total_questions}문제 중 ${results.correct_count}문제 정답 (${results.score}점) | 소요 시간: ${mins}분 ${secs}초`;

        // AI 종합 진단
        aiPrescriptionContent.textContent = results.ai_prescription || "수고하셨습니다! 틀린 문제의 핵심 개념을 복습해 보세요.";

        // 카운트 숫자 갱신
        countAll.textContent = results.total_questions;
        countWrong.textContent = results.wrong_count;
        countCorrect.textContent = results.correct_count;

        // 틀린 문제 재응시 버튼 토글
        if (results.wrong_count > 0) {
            retryWrongOnlyBtn.style.display = "inline-flex";
            retryWrongOnlyBtn.innerHTML = `<span>🔴 틀린 문제 ${results.wrong_count}개만 다시 풀기</span>`;
        } else {
            retryWrongOnlyBtn.style.display = "none";
        }

        renderGradedCards(results.graded_questions, "all");
        showView("results");
    }

    // 14. 채점된 문제 상세 리뷰 카드 렌더링
    function renderGradedCards(gradedList, filter = "all") {
        gradedReviewList.innerHTML = "";

        const filtered = gradedList.filter(g => {
            if (filter === "wrong") return !g.is_correct;
            if (filter === "correct") return g.is_correct;
            return true;
        });

        if (filtered.length === 0) {
            gradedReviewList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    해당하는 문제가 없습니다.
                </div>
            `;
            return;
        }

        filtered.forEach((g, idx) => {
            const card = document.createElement("div");
            card.className = `review-card ${g.is_correct ? 'correct' : 'wrong'}`;

            const resultTag = g.is_correct
                ? `<span class="result-tag-correct">🟢 정답 (+${g.earned_points}점)</span>`
                : `<span class="result-tag-wrong">🔴 오답 (0점)</span>`;

            const sourceBadge = g.source_tag ? `<span class="q-source-tag">🎯 ${g.source_tag}</span>` : "";

            let codeSnippetHtml = "";
            if (g.code_snippet) {
                codeSnippetHtml = `<pre class="q-code-snippet"><code>${escapeHtml(g.code_snippet)}</code></pre>`;
            }

            // 4~5지선다 전체 보기 목록 및 선지별 정답/오답 마킹
            let optionsReviewHtml = "";
            if (g.type === "multiple_choice" && g.options && g.options.length > 0) {
                const normUserAns = (g.user_answer || "").trim();
                const normCorrectAns = (g.correct_answer || "").trim();

                const itemsHtml = g.options.map((opt, optIdx) => {
                    const optTrim = opt.trim();
                    // 정답 선지 여부 판정 (전체 일치 또는 "1." 앞번호 일치)
                    const isCorrect = (optTrim === normCorrectAns || (normCorrectAns.length >= 2 && optTrim.startsWith(normCorrectAns.slice(0, 2))));
                    // 사용자가 선택한 선지 여부 판정
                    const isUserPick = (normUserAns && (optTrim === normUserAns || (normUserAns.length >= 2 && optTrim.startsWith(normUserAns.slice(0, 2)))));

                    let itemClass = "review-choice-item";
                    let badgeHtml = "";

                    if (isCorrect && isUserPick) {
                        itemClass += " choice-correct-user";
                        badgeHtml = `<span class="choice-review-badge correct">✔ 정답 (내가 맞힘)</span>`;
                    } else if (isCorrect) {
                        itemClass += " choice-correct";
                        badgeHtml = `<span class="choice-review-badge correct">✔ 모범 정답</span>`;
                    } else if (isUserPick) {
                        itemClass += " choice-wrong-user";
                        badgeHtml = `<span class="choice-review-badge wrong">✘ 내가 고른 오답</span>`;
                    } else {
                        itemClass += " choice-neutral";
                    }

                    return `
                        <div class="${itemClass}">
                            <div class="choice-content">
                                <span class="choice-marker">${optIdx + 1}</span>
                                <span class="choice-text">${escapeHtml(optTrim)}</span>
                            </div>
                            ${badgeHtml}
                        </div>
                    `;
                }).join("");

                optionsReviewHtml = `
                    <div class="review-options-container">
                        <div class="review-options-header">📋 4~5지선다 전체 보기 및 선지별 정·오답 분석</div>
                        <div class="review-options-list">${itemsHtml}</div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="q-card-header">
                    <div class="q-num-wrap">
                        <span class="q-badge">Q${g.id}</span>
                        ${resultTag}
                    </div>
                    ${sourceBadge}
                </div>
                <h3 class="q-title">${escapeHtml(g.question)}</h3>
                ${codeSnippetHtml}

                ${optionsReviewHtml}

                <div class="answer-comparison-box">
                    <div class="ans-row">
                        <span class="ans-label user">내가 쓴 답:</span>
                        <span class="ans-text ${g.is_correct ? 'correct-text' : 'wrong-text'}">${escapeHtml(g.user_answer)}</span>
                    </div>
                    <div class="ans-row">
                        <span class="ans-label correct">모범 정답:</span>
                        <span class="ans-text correct-text">${escapeHtml(g.correct_answer)}</span>
                    </div>
                </div>

                <div class="explanation-box">
                    <div class="explanation-title">💡 상세 단계별 해설 & 핵심 시험 꿀팁</div>
                    <p>${escapeHtml(g.explanation)}</p>
                </div>
            `;

            gradedReviewList.appendChild(card);
        });
    }

    // 15. 필터 탭 클릭 이벤트
    filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            filterTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const filter = tab.getAttribute("data-filter");
            if (gradedResults) {
                renderGradedCards(gradedResults.graded_questions, filter);
            }
        });
    });

    // 16. [틀린 문제만 다시 풀기]
    retryWrongOnlyBtn.addEventListener("click", () => {
        if (!gradedResults || !currentExam) return;
        const wrongIds = gradedResults.graded_questions.filter(g => !g.is_correct).map(g => g.id);
        const wrongQuestions = currentExam.questions.filter(q => wrongIds.includes(q.id));

        if (wrongQuestions.length === 0) {
            alert("틀린 문제가 없습니다! 완벽하게 마스터하셨습니다.");
            return;
        }

        const wrongExam = {
            ...currentExam,
            exam_title: `[오답 집중 복습] ${currentExam.exam_title}`,
            questions: wrongQuestions,
            time_limit_minutes: Math.max(5, wrongQuestions.length * 2)
        };

        currentExam = wrongExam;
        userAnswers = {};
        startExamSession(wrongExam);
    });

    // 17. [새로운 시험 만들기]
    newExamBtn.addEventListener("click", () => {
        if (confirm("새로운 모의시험을 생성하시겠습니까?")) {
            showView("setup");
        }
    });

    // 18. [인쇄 / PDF 저장]
    printExamBtn.addEventListener("click", () => {
        window.print();
    });

    // 보조 함수: HTML 이스케이프
    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
