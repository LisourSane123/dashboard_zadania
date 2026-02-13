// ════════════════════════════════════════════════
//  Dashboard – Touchscreen Task Display
//  With filter bar & touch drag-and-drop reorder
// ════════════════════════════════════════════════

(function () {
    "use strict";

    // ─── Config ───
    const SLEEP_TIMEOUT_MS = 30000;      // 30 seconds
    const NIGHT_START_HOUR = 23;          // 23:00
    const NIGHT_END_HOUR = 5;             // 05:00
    const REFRESH_INTERVAL_MS = 30000;    // Refresh tasks every 30s
    const SWIPE_THRESHOLD = 100;          // px needed to count as swipe
    const HOLD_DURATION_MS = 500;         // hold time before drag starts

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
    let currentFilter = "all"; // "all" | "one-time" | "recurring"

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
    //  Night mode (23:00 – 05:00)
    // ════════════════════════════════════════════

    let isNightActive = false;

    function checkNightMode() {
        const hour = new Date().getHours();
        // Night spans midnight: 23 <= hour OR hour < 5
        const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;

        if (isNight && !isNightActive) {
            // Entering night mode → cut screen power entirely
            isNightActive = true;
            nightOverlay.classList.remove("hidden");
            if (sleepTimer) clearTimeout(sleepTimer);
            fetch("/api/screen/off", { method: "POST" }).catch(() => {});
        } else if (!isNight && isNightActive) {
            // Leaving night mode → restore screen power
            isNightActive = false;
            nightOverlay.classList.add("hidden");
            fetch("/api/screen/on", { method: "POST" }).catch(() => {});
            // Also make sure sleep overlay is gone and timer resets
            if (isSleeping) {
                isSleeping = false;
                sleepOverlay.classList.add("hidden");
            }
            resetSleepTimer();
        }
    }

    // ════════════════════════════════════════════
    //  Sleep / Wake
    // ════════════════════════════════════════════

    function resetSleepTimer() {
        if (sleepTimer) clearTimeout(sleepTimer);
        sleepTimer = setTimeout(goToSleep, SLEEP_TIMEOUT_MS);
    }

    function goToSleep() {
        if (isNightActive) return; // night mode handles its own power
        isSleeping = true;
        sleepOverlay.classList.remove("hidden");
        // Turn off RPi backlight (screen goes truly dark)
        fetch("/api/backlight/off", { method: "POST" }).catch(() => {});
    }

    function wakeUp() {
        if (!isSleeping) return;
        isSleeping = false;
        // Turn on RPi backlight first
        fetch("/api/backlight/on", { method: "POST" }).catch(() => {});
        sleepOverlay.classList.add("hidden");
        resetSleepTimer();
    }
    // Expose to onclick
    window.wakeUp = wakeUp;

    // Overlay: also wake on touch (touchscreens may not fire click)
    sleepOverlay.addEventListener("touchstart", function (e) {
        e.preventDefault();
        wakeUp();
    });

    // Any touch/mouse activity resets the sleep timer
    function onActivity() {
        if (isSleeping) return;
        resetSleepTimer();
    }

    document.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("mousemove", onActivity, { passive: true });
    document.addEventListener("click", onActivity, { passive: true });

    // ════════════════════════════════════════════
    //  Filter bar
    // ════════════════════════════════════════════

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const filter = btn.dataset.filter;

            // Toggle: if clicking the active filter (not "all"), go back to "all"
            if (filter === currentFilter && filter !== "all") {
                currentFilter = "all";
            } else {
                currentFilter = filter;
            }

            // Update active state
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            if (currentFilter === "all") {
                document.querySelector('[data-filter="all"]').classList.add("active");
            } else {
                document.querySelector(`[data-filter="${currentFilter}"]`).classList.add("active");
            }

            renderTasks();
        });
    });

    // ════════════════════════════════════════════
    //  Fetch & render tasks
    // ════════════════════════════════════════════

    let fetchFailCount = 0;

    async function fetchTasks() {
        try {
            const resp = await fetch("/api/tasks/today");
            tasks = applyLocalOrder(await resp.json());
            fetchFailCount = 0;
            renderTasks();
        } catch (e) {
            fetchFailCount++;
            console.error("Error fetching tasks:", e, "(" + fetchFailCount + " failures)");
            // If server is unreachable for 3+ cycles, reload the page
            if (fetchFailCount >= 3) {
                fetchFailCount = 0;
                location.reload();
            }
        }
    }

    function getFilteredTasks() {
        if (currentFilter === "one-time") return tasks.filter(t => !t.is_recurring);
        if (currentFilter === "recurring") return tasks.filter(t => t.is_recurring);
        return tasks;
    }

    function renderTasks() {
        tasksList.innerHTML = "";

        const filtered = getFilteredTasks();
        const pending = filtered.filter(t => !t.completed_today);
        const allPending = tasks.filter(t => !t.completed_today);

        if (tasks.length === 0) {
            allDone.classList.add("hidden");
            noTasks.classList.remove("hidden");
            return;
        }

        noTasks.classList.add("hidden");

        if (pending.length === 0) {
            allDone.classList.remove("hidden");
            if (filtered.length === 0 && tasks.length > 0) {
                const emptyEl = document.createElement("div");
                emptyEl.className = "all-done";
                emptyEl.innerHTML = `
                    <div class="all-done-icon">${currentFilter === "one-time" ? "📌" : "🔄"}</div>
                    <div class="all-done-text">Brak zadań w tej kategorii</div>
                `;
                tasksList.appendChild(emptyEl);
                allDone.classList.add("hidden");
            }
            return;
        }

        allDone.classList.add("hidden");

        pending.forEach(task => {
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

        // Drag handle
        const handle = document.createElement("div");
        handle.className = "drag-handle";
        handle.textContent = "⠿";
        el.appendChild(handle);

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
            if (task.recurrence_type === "weekdays" && task.recurrence_days) {
                const dayLabels = { mon: "Pn", tue: "Wt", wed: "Śr", thu: "Cz", fri: "Pt", sat: "Sb", sun: "Nd" };
                const days = task.recurrence_days.split(",").map(d => dayLabels[d.trim()] || d).join(", ");
                badge.textContent = `🔄 ${days}`;
            } else {
                const labels = { days: "dni", weeks: "tyg.", months: "mies." };
                badge.textContent = `🔄 Co ${task.recurrence_value} ${labels[task.recurrence_type] || task.recurrence_type}`;
            }
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

            // Attach swipe + drag handling
            attachSwipeAndDrag(el, task);
        }

        return el;
    }

    // ════════════════════════════════════════════
    //  Swipe-to-complete + Hold-to-drag reorder
    // ════════════════════════════════════════════

    let dragState = {
        active: false,
        el: null,
        placeholder: null,
        startY: 0,
        offsetY: 0,
        holdTimer: null,
    };

    function attachSwipeAndDrag(el, task) {
        let startX = 0, startY = 0;
        let currentX = 0;
        let lastY = 0;
        let isSwiping = false;
        let isScrolling = false;
        let directionDecided = false;

        // ─── Touch events ───
        el.addEventListener("touchstart", (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            currentX = startX;
            lastY = startY;
            isSwiping = false;
            isScrolling = false;
            directionDecided = false;

            dragState.holdTimer = setTimeout(() => {
                if (!directionDecided || !isSwiping) {
                    startDrag(el, touch);
                }
            }, HOLD_DURATION_MS);
        }, { passive: true });

        el.addEventListener("touchmove", (e) => {
            const touch = e.touches[0];
            currentX = touch.clientX;
            const dx = currentX - startX;
            const dy = touch.clientY - startY;

            if (dragState.active && dragState.el === el) {
                e.preventDefault();
                moveDrag(touch);
                return;
            }

            if (!directionDecided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                directionDecided = true;
                if (Math.abs(dx) > Math.abs(dy)) {
                    isSwiping = true;
                    clearTimeout(dragState.holdTimer);
                } else {
                    isScrolling = true;
                    clearTimeout(dragState.holdTimer);
                }
            }

            if (isScrolling) {
                e.preventDefault();
                const moveY = touch.clientY - lastY;
                lastY = touch.clientY;
                // Ręczny scroll — działa nawet gdy natywny touch scroll nie działa
                window.scrollBy(0, -moveY);
                return;
            }

            if (isSwiping && dx < 0) {
                e.preventDefault();
                el.style.transition = "none";
                el.style.transform = `translateX(${dx}px)`;
            }

            lastY = touch.clientY;
        }, { passive: false });

        el.addEventListener("touchend", () => {
            clearTimeout(dragState.holdTimer);

            if (dragState.active && dragState.el === el) {
                endDrag();
                return;
            }

            if (isScrolling) {
                isScrolling = false;
                directionDecided = false;
                return;
            }

            if (isSwiping) {
                const diff = currentX - startX;
                if (diff < -SWIPE_THRESHOLD) {
                    el.style.transition = "transform 0.3s ease, opacity 0.3s ease";
                    el.classList.add("completing");
                    completeTask(task.id);
                    setTimeout(() => fetchTasks(), 350);
                } else {
                    el.style.transition = "transform 0.2s ease";
                    el.style.transform = "translateX(0)";
                }
            } else if (!directionDecided) {
                // Tap — toggle description
                el.classList.toggle("expanded");
            }
            isSwiping = false;
            directionDecided = false;
        });

        el.addEventListener("touchcancel", () => {
            clearTimeout(dragState.holdTimer);
            if (dragState.active && dragState.el === el) cancelDrag();
            el.style.transition = "transform 0.2s ease";
            el.style.transform = "translateX(0)";
        });

        // ─── Mouse events (testing) ───
        el.addEventListener("mousedown", (e) => {
            startX = e.clientX;
            startY = e.clientY;
            currentX = startX;
            isSwiping = false;
            directionDecided = false;
            el.style.transition = "none";

            dragState.holdTimer = setTimeout(() => {
                startDrag(el, e);
            }, HOLD_DURATION_MS);

            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (dragState.active && dragState.el === el) {
                moveDrag(e);
                return;
            }
            currentX = e.clientX;
            const dx = currentX - startX;
            const dy = e.clientY - startY;

            if (!directionDecided && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                directionDecided = true;
                if (Math.abs(dx) > Math.abs(dy)) {
                    isSwiping = true;
                    clearTimeout(dragState.holdTimer);
                } else {
                    clearTimeout(dragState.holdTimer);
                    return;
                }
            }

            if (isSwiping && dx < 0) el.style.transform = `translateX(${dx}px)`;
        };

        const onMouseUp = () => {
            clearTimeout(dragState.holdTimer);
            if (dragState.active && dragState.el === el) { endDrag(); return; }
            if (isSwiping) {
                isSwiping = false;
                const diff = currentX - startX;
                if (diff < -SWIPE_THRESHOLD) {
                    el.style.transition = "transform 0.3s ease, opacity 0.3s ease";
                    el.classList.add("completing");
                    completeTask(task.id);
                    setTimeout(() => fetchTasks(), 350);
                } else {
                    el.style.transition = "transform 0.2s ease";
                    el.style.transform = "translateX(0)";
                }
            } else if (!directionDecided) {
                // Click — toggle description
                el.classList.toggle("expanded");
            }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }

    // ═══ Drag reorder logic ═══

    function startDrag(el, event) {
        dragState.active = true;
        dragState.el = el;

        // Zablokuj natywny scroll tylko na czas drag
        el.style.touchAction = "none";

        const rect = el.getBoundingClientRect();
        dragState.offsetY = (event.clientY || event.touches?.[0]?.clientY || 0) - rect.top;

        el.classList.add("dragging");
        el.style.transition = "none";
        el.style.transform = "";
        el.style.position = "fixed";
        el.style.top = rect.top + "px";
        el.style.left = rect.left + "px";
        el.style.width = rect.width + "px";
        el.style.zIndex = "1000";

        dragState.placeholder = document.createElement("div");
        dragState.placeholder.style.height = rect.height + "px";
        dragState.placeholder.style.margin = "3px 0";
        dragState.placeholder.style.borderRadius = "12px";
        dragState.placeholder.style.border = "2px dashed #e94560";
        dragState.placeholder.style.background = "rgba(233, 69, 96, 0.05)";
        el.parentNode.insertBefore(dragState.placeholder, el);

        if (navigator.vibrate) navigator.vibrate(50);
    }

    function moveDrag(event) {
        if (!dragState.active) return;
        const y = (event.clientY || event.touches?.[0]?.clientY || 0);
        dragState.el.style.top = (y - dragState.offsetY) + "px";

        const items = Array.from(tasksList.querySelectorAll(".task-item:not(.dragging):not(.completed-today)"));
        items.forEach(item => item.classList.remove("drag-over"));

        for (const item of items) {
            const rect = item.getBoundingClientRect();
            if (y < rect.top + rect.height / 2) {
                item.classList.add("drag-over");
                tasksList.insertBefore(dragState.placeholder, item);
                return;
            }
        }
        const lastPending = items[items.length - 1];
        if (lastPending) tasksList.insertBefore(dragState.placeholder, lastPending.nextSibling);
    }

    function endDrag() {
        if (!dragState.active) return;
        const el = dragState.el;
        tasksList.insertBefore(el, dragState.placeholder);
        dragState.placeholder.remove();

        el.classList.remove("dragging");
        el.style.position = "";
        el.style.top = "";
        el.style.left = "";
        el.style.width = "";
        el.style.zIndex = "";
        el.style.transform = "";
        el.style.transition = "";
        el.style.touchAction = "";

        tasksList.querySelectorAll(".task-item").forEach(i => i.classList.remove("drag-over"));
        dragState.active = false;
        dragState.el = null;
        dragState.placeholder = null;

        saveOrder();
    }

    function cancelDrag() {
        if (!dragState.active) return;
        if (dragState.placeholder) dragState.placeholder.remove();
        const el = dragState.el;
        el.classList.remove("dragging");
        el.style.position = "";
        el.style.top = "";
        el.style.left = "";
        el.style.width = "";
        el.style.zIndex = "";
        el.style.transform = "";
        el.style.transition = "";
        el.style.touchAction = "";
        tasksList.querySelectorAll(".task-item").forEach(i => i.classList.remove("drag-over"));
        dragState.active = false;
        dragState.el = null;
        dragState.placeholder = null;
    }

    function saveOrder() {
        // Temporary reorder — saved in localStorage, resets daily
        const orderedIds = Array.from(tasksList.querySelectorAll(".task-item"))
            .map(el => parseInt(el.dataset.taskId))
            .filter(id => !isNaN(id));

        const today = new Date().toISOString().slice(0, 10);
        try {
            localStorage.setItem("dashboard_order", JSON.stringify({
                date: today,
                ids: orderedIds
            }));
        } catch (e) {
            console.error("Error saving temp order:", e);
        }
    }

    function applyLocalOrder(taskList) {
        try {
            const raw = localStorage.getItem("dashboard_order");
            if (!raw) return taskList;
            const stored = JSON.parse(raw);
            const today = new Date().toISOString().slice(0, 10);
            if (stored.date !== today) {
                localStorage.removeItem("dashboard_order");
                return taskList;
            }
            const orderMap = new Map();
            stored.ids.forEach((id, idx) => orderMap.set(id, idx));
            return [...taskList].sort((a, b) => {
                const oa = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
                const ob = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
                return oa - ob;
            });
        } catch (e) {
            return taskList;
        }
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
    //  Global touch scroll fallback
    //  Handles scroll on empty areas (gaps, header, etc.)
    // ════════════════════════════════════════════
    (function () {
        let gStartY = 0, gLastY = 0, gActive = false;
        document.addEventListener("touchstart", (e) => {
            // Nie przejmuj jeśli dotknięto task-item (ma swój handler)
            if (e.target.closest(".task-item")) return;
            // Nie przejmuj filtrów
            if (e.target.closest(".filter-bar")) return;
            gStartY = e.touches[0].clientY;
            gLastY = gStartY;
            gActive = true;
        }, { passive: true });
        document.addEventListener("touchmove", (e) => {
            if (!gActive) return;
            const y = e.touches[0].clientY;
            const dy = y - gLastY;
            gLastY = y;
            if (Math.abs(y - gStartY) > 8) {
                e.preventDefault();
                window.scrollBy(0, -dy);
            }
        }, { passive: false });
        document.addEventListener("touchend", () => { gActive = false; });
        document.addEventListener("touchcancel", () => { gActive = false; });
    })();

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
