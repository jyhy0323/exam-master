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
    const questionCountSelect = document.getElementById("questionCount");
    const questionTypesSelect = document.getElementById("questionTypes");
    const modeRadios = document.querySelectorAll('input[name="mode"]');

    // 시험 화면 요소
    const examSubjectPill = document.getElementById("examSubjectPill");
    const examTitleText = document.getElementById("examTitleText");
    const timerBox = document.getElementById("timerBox");
    const timerDisplay = document.getElementById("timerDisplay");
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
        const questionCount = questionCountSelect.value;
        const questionTypes = questionTypesSelect.value;

        if (!lectureNotes && !practiceProblems) {
            alert("강의 자료 요약이나 학생참여 웹 연습문제를 하나 이상 입력해 주세요!");
            return;
        }

        showLoading(
            "AI 수석 출제위원이 시험 문제를 출제하고 있습니다...",
            `[${subjectName}] 입력 자료와 교수님 연습문제를 분석하여 실제 시험 적중 문항을 구성 중입니다.`
        );

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lecture_notes: lectureNotes,
                    practice_problems: practiceProblems,
                    subject_name: subjectName,
                    mode: selectedMode,
                    question_count: questionCount,
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

    // 7. 실전 시험 세션 시작
    function startExamSession(exam) {
        examSubjectPill.textContent = exam.subject || "중간고사";
        examTitleText.textContent = exam.exam_title || "실전 모의고사";
        
        // 시간 설정 (분 단위 -> 초 단위)
        const limitMinutes = exam.time_limit_minutes || 15;
        totalExamSeconds = limitMinutes * 60;
        remainingSeconds = totalExamSeconds;
        timeSpentSeconds = 0;

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
            const mins = Math.floor(remainingSeconds / 60);
            const secs = remainingSeconds % 60;
            timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            if (remainingSeconds <= 180) { // 3분 미만
                timerBox.classList.add("warning");
            }
        }

        updateDisplay();

        timerInterval = setInterval(() => {
            remainingSeconds--;
            timeSpentSeconds++;
            updateDisplay();

            if (remainingSeconds <= 0) {
                clearInterval(timerInterval);
                alert("⏱️ 시험 시간이 종료되었습니다! 작성하신 답안을 자동으로 제출합니다.");
                submitExamAnswers();
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

    // 12. 답안 서버 제출 및 채점 API 호출
    async function submitExamAnswers() {
        stopTimer();
        showLoading(
            "AI가 답안을 정밀 채점하고 있습니다...",
            "객관식 정답 비교 및 주관식 키워드 분석, 실전 약점 보완 처방전을 작성 중입니다."
        );

        try {
            const response = await fetch("/api/grade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    questions: currentExam.questions,
                    user_answers: userAnswers,
                    time_spent_seconds: timeSpentSeconds
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || "채점에 실패했습니다.");
            }

            gradedResults = data;
            displayResults(gradedResults);

        } catch (err) {
            alert(`채점 오류: ${err.message}`);
        } finally {
            hideLoading();
        }
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
                    <div class="explanation-title">💡 상세 해설 & 핵심 시험 꿀팁</div>
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
