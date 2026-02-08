// ════════════════════════════════════════════════
//  Dashboard – Touchscreen Task Display
// ════════════════════════════════════════════════

(function () {
    "use strict";

    // ─── Config ───
    const SLEEP_TIMEOUT_MS = 15000;      // 15 seconds
    const NIGHT_START_HOUR = 0;           // 00:00
    const NIGHT_END_HOUR = 5;             // 05:00
    const REFRESH_INTERVAL_MS = 30000;    // Refresh tasks every 30s
    const SWIPE_THRESHOLD = 100;          // px needed to count as swipe

    // ─── DOM refs ───
    const tasksList = document.getElementById("tasks-list");
    const allDone = document.getElementById("all-done");
    const noTasks = document.getElementById("no-tasks");
    const sleepOverlay = document.getElementById("sleep-overlay");
    const nightOverlay = document.getElementById("night-overlay");
    const dateDisplay = document.getElementById("date-display");
    const timeDisplay = document.getElementById("time-display");

    // ─── State ───
    let sleepTimer = null;
    let isSleeping = false;
    let tasks = [];

    // ════════════════════════════════════════════
    //  Clock & date
    // ════════════════════════════════════════════

    const dayNames = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
    const monthNames = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
        "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

    function updateClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, "0");
        const m = String(now.getMinutes()).padStart(2, "0");
        timeDisplay.textContent = `${h}:${m}`;
        dateDisplay.textContent = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    // ════════════════════════════════════════════
    //  Night mode (00:00 – 05:00)
    // ════════════════════════════════════════════

    function checkNightMode() {
        const hour = new Date().getHours();
        const isNight = hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
        nightOverlay.classList.toggle("hidden", !isNight);
    }

    // ════════════════════════════════════════════
    //  Sleep / Wake
    // ════════════════════════════════════════════

    function resetSleepTimer() {
        if (sleepTimer) clearTimeout(sleepTimer);
        sleepTimer = setTimeout(goToSleep, SLEEP_TIMEOUT_MS);
    }

    function goToSleep() {
        isSleeping = true;
        sleepOverlay.classList.remove("hidden");
    }

    function wakeUp() {
        isSleeping = false;
        sleepOverlay.classList.add("hidden");
        resetSleepTimer();
    }
    // Expose to onclick
    window.wakeUp = wakeUp;

    // Any touch/mouse activity resets the sleep timer
    function onActivity() {
        if (isSleeping) return;
        resetSleepTimer();
    }

    document.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("mousemove", onActivity, { passive: true });
    document.addEventListener("click", onActivity, { passive: true });

    // ════════════════════════════════════════════
    //  Fetch & render tasks
    // ════════════════════════════════════════════

    async function fetchTasks() {
        try {
            const resp = await fetch("/api/tasks/today");
            tasks = await resp.json();
            renderTasks();
        } catch (e) {
            console.error("Error fetching tasks:", e);
        }
    }

    function renderTasks() {
        tasksList.innerHTML = "";

        const pending = tasks.filter(t => !t.completed_today);
        const completed = tasks.filter(t => t.completed_today);

        if (tasks.length === 0) {
            allDone.classList.add("hidden");
            noTasks.classList.remove("hidden");
            return;
        }

        noTasks.classList.add("hidden");

        if (pending.length === 0) {
            allDone.classList.remove("hidden");
        } else {
            allDone.classList.add("hidden");
        }

        // Render pending first, then completed
        [...pending, ...completed].forEach(task => {
            const el = createTaskElement(task);
            tasksList.appendChild(el);
        });
    }

    function createTaskElement(task) {
        const el = document.createElement("div");
        el.className = "task-item" +
            (task.is_recurring ? " recurring" : " one-time") +
            (task.completed_today ? " completed-today" : "");
        el.dataset.taskId = task.id;

        // Swipe background
        const swipeBg = document.createElement("div");
        swipeBg.className = "swipe-bg complete";
        swipeBg.textContent = "✓ Wykonane";
        el.appendChild(swipeBg);

        // Content
        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = task.title;
        el.appendChild(title);

        if (task.description) {
            const desc = document.createElement("div");
            desc.className = "task-desc";
            desc.textContent = task.description;
            el.appendChild(desc);
        }

        // Badge
        const badge = document.createElement("span");
        badge.className = "task-badge " + (task.is_recurring ? "recurring" : "one-time");
        if (task.is_recurring) {
            const labels = { days: "dni", weeks: "tyg.", months: "mies." };
            badge.textContent = `🔄 Co ${task.recurrence_value} ${labels[task.recurrence_type] || task.recurrence_type}`;
        } else {
            badge.textContent = "📌 Jednorazowe";
        }
        el.appendChild(badge);

        // Swipe hint
        if (!task.completed_today) {
            const hint = document.createElement("div");
            hint.className = "swipe-hint";
            hint.textContent = "⟵";
            el.appendChild(hint);

            // Attach swipe handling
            attachSwipe(el, task);
        }

        return el;
    }

    // ════════════════════════════════════════════
    //  Swipe-to-complete
    // ════════════════════════════════════════════

    function attachSwipe(el, task) {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        el.addEventListener("touchstart", (e) => {
            startX = e.touches[0].clientX;
            currentX = startX;
            isDragging = true;
            el.style.transition = "none";
        }, { passive: true });

        el.addEventListener("touchmove", (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diff = currentX - startX;
            // Only allow left swipe
            if (diff < 0) {
                el.style.transform = `translateX(${diff}px)`;
            }
        }, { passive: true });

        el.addEventListener("touchend", () => {
            if (!isDragging) return;
            isDragging = false;
            const diff = currentX - startX;

            if (diff < -SWIPE_THRESHOLD) {
                // Complete task
                el.style.transition = "transform 0.3s ease, opacity 0.3s ease";
                el.classList.add("completing");
                completeTask(task.id);
                setTimeout(() => {
                    fetchTasks();
                }, 350);
            } else {
                // Snap back
                el.style.transition = "transform 0.2s ease";
                el.style.transform = "translateX(0)";
            }
        });

        // Mouse fallback for testing
        el.addEventListener("mousedown", (e) => {
            startX = e.clientX;
            currentX = startX;
            isDragging = true;
            el.style.transition = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging || el !== e.target.closest(".task-item")) return;
            currentX = e.clientX;
            const diff = currentX - startX;
            if (diff < 0) {
                el.style.transform = `translateX(${diff}px)`;
            }
        });

        document.addEventListener("mouseup", () => {
            if (!isDragging) return;
            isDragging = false;
            const diff = currentX - startX;

            if (diff < -SWIPE_THRESHOLD) {
                el.style.transition = "transform 0.3s ease, opacity 0.3s ease";
                el.classList.add("completing");
                completeTask(task.id);
                setTimeout(() => {
                    fetchTasks();
                }, 350);
            } else {
                el.style.transition = "transform 0.2s ease";
                el.style.transform = "translateX(0)";
            }
        });
    }

    async function completeTask(taskId) {
        try {
            await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
        } catch (e) {
            console.error("Error completing task:", e);
        }
    }

    // ════════════════════════════════════════════
    //  Prevent context menu & other exits
    // ════════════════════════════════════════════

    document.addEventListener("contextmenu", e => e.preventDefault());
    document.addEventListener("keydown", e => {
        // Block F5, Ctrl+R, Ctrl+W, Alt+F4, etc.
        if (e.key === "F5" || e.key === "F11" ||
            (e.ctrlKey && (e.key === "r" || e.key === "w" || e.key === "t" || e.key === "l" || e.key === "n")) ||
            (e.altKey && e.key === "F4")) {
            e.preventDefault();
        }
    });

    // ════════════════════════════════════════════
    //  Init
    // ════════════════════════════════════════════

    function init() {
        updateClock();
        setInterval(updateClock, 10000);

        checkNightMode();
        setInterval(checkNightMode, 30000);

        fetchTasks();
        setInterval(fetchTasks, REFRESH_INTERVAL_MS);

        resetSleepTimer();
    }

    init();

})();
