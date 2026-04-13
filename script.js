 // ----- GLOBALS -----
      let senders = [],
        stats = [],
        running = false,
        paused = false;
      let receiver = { x: 850, y: 250 };
      let busX = 550;
      let collisionCount = 0;
      let slotTime = 400,
        propagationDelay = 100;
      let activePackets = [],
        channelBusy = false;
      let activeAnimations = new Map(),
        packetMovements = new Map();
      let randomIntervalId = null;
      let perSenderInflight = [0, 0, 0, 0, 0];
      let pendingBackoffTimers = new Map();

      function getSenderColor(senderId) {
        let hue = (senderId * 72) % 360;
        return `hsl(${hue}, 82%, 60%)`;
      }
      function showMaxCollisionsPopup(senderId, senderX, senderY) {
        let popup = document.createElement("div");
        popup.className = "max-collision-popup";
        popup.innerHTML = `<i class="fas fa-exclamation-triangle"></i> S${senderId} · attempt >16! Packet dropped forever`;
        popup.style.left = senderX + "px";
        popup.style.top = senderY - 40 + "px";
        document.getElementById("network").appendChild(popup);
        setTimeout(() => popup.remove(), 2000);
      }

      function initStats(keepInitialCollisions = true) {
        for (let i = 0; i < 5; i++) {
          if (!keepInitialCollisions || !stats[i]) {
            stats[i] = {
              collisions: 0,
              defers: 0,
              totalWaitMs: 0,
              dropped: 0,
              attemptsTotal: 0,
              packetsSent: 0,
              packetsDelivered: 0,
            };
          } else {
            let initColl = stats[i].collisions;
            stats[i] = {
              collisions: initColl,
              defers: 0,
              totalWaitMs: 0,
              dropped: 0,
              attemptsTotal: initColl,
              packetsSent: 0,
              packetsDelivered: 0,
            };
          }
          perSenderInflight[i] = 0;
        }
      }

      function applyInitialCollisionsFromUI() {
        for (let i = 0; i < senders.length; i++) {
          const input = document.getElementById(`initColl${i}`);
          if (input) {
            let val = parseInt(input.value, 10);
            if (isNaN(val)) val = 0;
            val = Math.min(16, Math.max(0, val));
            input.value = val;
            stats[i].collisions = val;
            stats[i].attemptsTotal = val;
            senders[i].attempt = val;
            updateSenderStatusUI(i);
          }
        }
        updateStatsDisplay();
      }

      function resetSim() {
        for (let [el, anim] of activeAnimations) if (anim.cancel) anim.cancel();
        activeAnimations.clear();
        packetMovements.clear();
        document.querySelectorAll(".packet").forEach((p) => p.remove());
        document
          .querySelectorAll(".wait-badge, .success-popup, .max-collision-popup")
          .forEach((el) => el.remove());
        activePackets = [];
        channelBusy = false;
        clearAllBackoffTimers();
        collisionCount = 0;
        perSenderInflight.fill(0);
        initStats(false);
        for (let i = 0; i < senders.length; i++) {
          senders[i].attempt = 0;
          senders[i]._onIdleCb = null;
        }
        applyInitialCollisionsFromUI();
        updateStatsDisplay();
        senders.forEach((s) => updateSenderStatusUI(s.id));
        addLog(
          "🔄 Simulation reset · initial collisions applied (0-16)",
          "info",
        );
      }

      function clearAllBackoffTimers() {
        for (let [sid, timerId] of pendingBackoffTimers.entries())
          clearTimeout(timerId);
        pendingBackoffTimers.clear();
      }

      function addLog(message, type = "info") {
        const time = new Date().toLocaleTimeString("en-US", { hour12: false });
        logEntries.unshift({ time, message, type });
        if (logEntries.length > 450) logEntries.pop();
        renderLog();
      }
      let logEntries = [];
      function renderLog() {
        const container = document.getElementById("logList");
        container.innerHTML = logEntries
          .map(
            (entry) =>
              `<div class="log-entry"><span class="log-time">[${entry.time}]</span> <span class="log-${entry.type}">${entry.message}</span></div>`,
          )
          .join("");
      }
      document.getElementById("clearLogBtn").onclick = () => {
        logEntries = [];
        renderLog();
      };

      function animateElementLinear(el, sx, sy, dx, dy, dur, onComplete) {
        if (!el.isConnected) {
          if (onComplete) onComplete();
          return;
        }
        packetMovements.set(el, {
          sx,
          sy,
          dx,
          dy,
          dur,
          onComplete,
          targetX: sx + dx,
          targetY: sy + dy,
        });
        let start = performance.now(),
          frame = null,
          cancelled = false;
        const step = (now) => {
          if (!running || paused || cancelled || !el.isConnected) {
            if (frame) cancelAnimationFrame(frame);
            return;
          }
          let t = Math.min(1, (now - start) / dur);
          el.style.left = sx + dx * t + "px";
          el.style.top = sy + dy * t + "px";
          if (t < 1) frame = requestAnimationFrame(step);
          else {
            el.style.left = sx + dx + "px";
            el.style.top = sy + dy + "px";
            if (onComplete) onComplete();
            activeAnimations.delete(el);
            packetMovements.delete(el);
            cancelAnimationFrame(frame);
          }
        };
        frame = requestAnimationFrame(step);
        activeAnimations.set(el, {
          frame,
          cancel: () => {
            cancelled = true;
            if (frame) cancelAnimationFrame(frame);
            activeAnimations.delete(el);
          },
        });
      }

      function resumeAllMovements() {
        for (let [el, m] of packetMovements.entries()) {
          if (!el.isConnected) {
            packetMovements.delete(el);
            continue;
          }
          let curLeft = parseFloat(el.style.left),
            curTop = parseFloat(el.style.top);
          let remX = m.targetX - curLeft,
            remY = m.targetY - curTop;
          if (Math.hypot(remX, remY) < 0.5) {
            if (m.onComplete) m.onComplete();
            packetMovements.delete(el);
            continue;
          }
          let remDur =
            m.dur * (Math.hypot(remX, remY) / Math.hypot(m.dx, m.dy));
          animateElementLinear(
            el,
            curLeft,
            curTop,
            remX,
            remY,
            Math.max(10, remDur),
            m.onComplete,
          );
        }
      }

      function showSuccessPopup(senderId, senderX, senderY) {
        let popup = document.createElement("div");
        popup.className = "success-popup";
        popup.innerHTML = `<i class="fas fa-check-circle"></i> S${senderId} delivered!`;
        popup.style.left = senderX + 24 + "px";
        popup.style.top = senderY - 20 + "px";
        document.getElementById("network").appendChild(popup);
        setTimeout(() => popup.remove(), 1000);
      }

      function createPacket(sender) {
        let el = document.createElement("div");
        el.className = "packet";
        let color = getSenderColor(sender.id);
        el.style.background = color;
        el.style.boxShadow = `0 0 8px ${color}`;
        el.style.left = sender.x + "px";
        el.style.top = sender.y + 28 - 8 + "px";
        document.getElementById("network").appendChild(el);
        stats[sender.id].packetsSent++;
        perSenderInflight[sender.id]++;
        addLog(
          `🟢 S${sender.id} created packet (attempt ${sender.attempt + 1}/16+)`,
          "info",
        );
        updateSenderStatusUI(sender.id);
        updateStatsDisplay();
        return { sender, el };
      }

      function updateSenderStatusUI(senderId) {
        let card = document.querySelector(
          `.sender-card[data-sid='${senderId}']`,
        );
        if (card) {
          let statusSpan = card.querySelector(".sender-status");
          if (statusSpan) {
            let inflight = perSenderInflight[senderId];
            let delivered = stats[senderId].packetsDelivered;
            statusSpan.innerText = `✈️${inflight} | ✓${delivered} | Att:${senders[senderId].attempt}/16`;
          }
          let initInput = card.querySelector(`.init-collision-control input`);
          if (initInput && !running) {
            initInput.value = stats[senderId].collisions;
          }
        }
      }

      function showWaitBadge(sender, wait, r, k) {
        let label = document.createElement("div");
        label.className = "wait-badge";
        label.innerHTML = `<i class="fas fa-hourglass-half"></i> k=${k} r=${r} wait=${wait}ms (att:${sender.attempt + 1}/16+)`;
        label.style.left = sender.x + "px";
        label.style.top = sender.y - 28 + "px";
        document.getElementById("network").appendChild(label);
        setTimeout(() => label.remove(), wait);
        addLog(
          `⏳ S${sender.id} exponential backoff: k=${k}, r=${r}, wait ${wait}ms (attempt ${sender.attempt + 1}/16+)`,
          "warn",
        );
      }

      // --- Condition changed: drop only when attempt > 16 ---
      function sendPacket(sender) {
        if (!running || paused) return;
        if (sender.attempt > 16) {
          addLog(
            `❌ S${sender.id} CANNOT SEND: attempt >16, packet dropped`,
            "error",
          );
          stats[sender.id].dropped++;
          updateStatsDisplay();
          return;
        }
        if (channelBusy) {
          setTimeout(() => sendPacket(sender), 50);
          return;
        }
        let packet = createPacket(sender);
        moveToBus(packet, () => checkCollision(packet));
      }

      function moveToBus(packet, cb) {
        let s = packet.sender,
          startLeft = s.x,
          targetLeft = busX,
          dist = targetLeft - startLeft,
          dur = Math.abs(dist) * 9;
        let startTop = s.y + 28 - 8;
        packet.el.style.top = startTop + "px";
        packet.el.style.left = startLeft + "px";
        animateElementLinear(
          packet.el,
          startLeft,
          startTop,
          dist,
          0,
          dur,
          () => {
            if (running && !paused) cb();
          },
        );
      }

      function moveVertical(packet, cb) {
        let curY = parseFloat(packet.el.style.top),
          targetY = receiver.y - 8,
          dy = targetY - curY,
          dur = Math.abs(dy) * 9;
        let curX = parseFloat(packet.el.style.left);
        animateElementLinear(packet.el, curX, curY, 0, dy, dur, () => cb());
      }

      function moveHorizontal(packet) {
        let curX = parseFloat(packet.el.style.left),
          targetX = receiver.x,
          dx = targetX - curX,
          dur = Math.abs(dx) * 9;
        let curY = parseFloat(packet.el.style.top);
        animateElementLinear(packet.el, curX, curY, dx, 0, dur, () => {
          if (packet.el && packet.el.remove) packet.el.remove();
          packet.sender.attempt = 0;
          channelBusy = false;
          stats[packet.sender.id].packetsDelivered++;
          perSenderInflight[packet.sender.id]--;
          updateSenderStatusUI(packet.sender.id);
          addLog(
            `📦 S${packet.sender.id} DELIVERED successfully! (total: ${stats[packet.sender.id].packetsDelivered})`,
            "info",
          );
          showSuccessPopup(packet.sender.id, packet.sender.x, packet.sender.y);
          if (packet.sender._onIdleCb) {
            let cb = packet.sender._onIdleCb;
            packet.sender._onIdleCb = null;
            cb();
          }
          updateStatsDisplay();
        });
      }

      function moveToReceiver(packet) {
        moveVertical(packet, () => moveHorizontal(packet));
      }

      function checkCollision(packet) {
        if (!running || paused) return;
        if (channelBusy) {
          defer(packet.sender);
          packet.el.remove();
          perSenderInflight[packet.sender.id]--;
          updateSenderStatusUI(packet.sender.id);
          updateStatsDisplay();
          return;
        }
        activePackets.push(packet);
        setTimeout(() => {
          if (!running || paused) return;
          let cur = [...activePackets];
          activePackets = [];
          if (cur.length > 1) collision(cur);
          else if (cur.length === 1) {
            channelBusy = true;
            moveToReceiver(cur[0]);
          }
        }, 2 * propagationDelay);
      }

      // Drop condition: if attempt becomes >16 after increment
      function collision(packets) {
        collisionCount++;
        channelBusy = false;
        addLog(
          `💥 COLLISION! ${packets.map((p) => `S${p.sender.id}`).join(",")}`,
          "error",
        );
        packets.forEach((p) => p.el.classList.add("collision"));
        setTimeout(() => {
          packets.forEach((p) => {
            if (p.el && p.el.remove) p.el.remove();
            let s = p.sender;
            perSenderInflight[s.id]--;
            updateSenderStatusUI(s.id);

            s.attempt++; // increment collision counter
            if (s.attempt > 16) {
              stats[s.id].dropped++;
              stats[s.id].collisions++;
              addLog(
                `❌❌❌ S${s.id} PACKET DROPPED FOREVER! (attempt ${s.attempt} >16, max exceeded)`,
                "error",
              );
              showMaxCollisionsPopup(s.id, s.x, s.y);
              updateStatsDisplay();
              s.attempt = 0;
              return;
            }

            let k = Math.min(s.attempt - 1, 10);
            let r = Math.max(0, Math.floor(Math.random() * Math.pow(2, k)));
            let wait = r * slotTime;
            stats[s.id].collisions++;
            stats[s.id].totalWaitMs += wait;
            stats[s.id].attemptsTotal = s.attempt;
            updateStatsDisplay();
            showWaitBadge(s, wait, r, k);
            let timerId = setTimeout(() => {
              if (running && !paused) {
                addLog(
                  `🔄 S${s.id} retransmit (attempt ${s.attempt + 1}/16+)`,
                  "info",
                );
                sendPacket(s);
                pendingBackoffTimers.delete(s.id);
              }
            }, wait);
            pendingBackoffTimers.set(s.id, timerId);
          });
        }, 400);
      }

      function defer(sender) {
        sender.attempt++;
        if (sender.attempt > 16) {
          stats[sender.id].dropped++;
          stats[sender.id].defers++;
          addLog(
            `❌❌❌ S${sender.id} PACKET DROPPED FOREVER! (attempt ${sender.attempt} >16 during defer)`,
            "error",
          );
          showMaxCollisionsPopup(sender.id, sender.x, sender.y);
          updateStatsDisplay();
          sender.attempt = 0;
          return;
        }
        stats[sender.id].defers++;
        let k = Math.min(sender.attempt - 1, 10);
        let r = Math.max(0, Math.floor(Math.random() * Math.pow(2, k)));
        let wait = r * slotTime;
        stats[sender.id].totalWaitMs += wait;
        stats[sender.id].attemptsTotal = sender.attempt;
        updateStatsDisplay();
        showWaitBadge(sender, wait, r, k);
        addLog(
          `🚦 S${sender.id} channel busy, backoff ${wait}ms (attempt ${sender.attempt}/16+)`,
          "warn",
        );
        let timerId = setTimeout(() => {
          if (running && !paused) {
            addLog(
              `🔄 S${sender.id} retransmit (attempt ${sender.attempt + 1}/16+)`,
              "info",
            );
            sendPacket(sender);
            pendingBackoffTimers.delete(sender.id);
          }
        }, wait);
        pendingBackoffTimers.set(sender.id, timerId);
      }

      function getActiveSenders() {
        return senders.filter(
          (s) => document.getElementById("cb" + s.id)?.checked,
        );
      }
      function isIdle(s) {
        return (
          s.attempt === 0 &&
          !pendingBackoffTimers.has(s.id) &&
          perSenderInflight[s.id] === 0
        );
      }

      function sendSingle(s) {
        if (!running) {
          addLog(`⚠️ Simulation not running`, "warn");
          return;
        }
        if (isIdle(s)) {
          sendPacket(s);
          addLog(`✋ Manual send S${s.id}`, "info");
        } else addLog(`⛔ S${s.id} busy (backoff or in flight)`, "warn");
      }

      function startRandomMode() {
        if (randomIntervalId) clearTimeout(randomIntervalId);
        if (!document.getElementById("randomModeCheckbox").checked) return;
        function schedule() {
          if (
            !running ||
            paused ||
            !document.getElementById("randomModeCheckbox").checked
          )
            return;
          let active = getActiveSenders();
          if (active.length) {
            let rand = active[Math.floor(Math.random() * active.length)];
            if (isIdle(rand)) {
              sendPacket(rand);
              addLog(`🎲 Random trigger: S${rand.id}`, "info");
            }
          }
          let delay = 800 + Math.random() * 2700;
          randomIntervalId = setTimeout(schedule, delay);
        }
        schedule();
      }
      function stopRandomMode() {
        if (randomIntervalId) clearTimeout(randomIntervalId);
        randomIntervalId = null;
      }

      function updateStatsDisplay() {
        const tbody = document.getElementById("statsTableBody");
        if (!tbody) return;
        let html = "";
        senders.forEach((s) => {
          const st = stats[s.id];
          const color = getSenderColor(s.id);
          html += `<tr style="border-left: 3px solid ${color};">
            <td style="font-weight: bold; color: ${color};">S${s.id}</td>
            <td>${st.collisions}</td>
            <td>${st.defers}</td>
            <td>${Math.floor(st.totalWaitMs)} ms</td>
            <td>${st.packetsSent}</td>
            <td>${st.packetsDelivered}</td>
            <td style="color:#f87171;">${st.dropped}</td>
          </tr>`;
        });
        tbody.innerHTML = html;
        document.getElementById("globalCollisions").innerHTML =
          `🌐 Global total collisions: ${collisionCount}`;
      }

      function pauseSim() {
        if (!running || paused) return;
        paused = true;
        stopRandomMode();
        for (let [el, anim] of activeAnimations) if (anim.cancel) anim.cancel();
        activeAnimations.clear();
        clearAllBackoffTimers();
        document.getElementById("pauseBtn").disabled = true;
        document.getElementById("resumeBtn").disabled = false;
        addLog("⏸️ PAUSED", "warn");
      }
      function resumeSim() {
        if (!running || !paused) return;
        paused = false;
        resumeAllMovements();
        if (
          !document.getElementById("autoModeCheckbox").checked &&
          document.getElementById("randomModeCheckbox").checked
        )
          startRandomMode();
        document.getElementById("pauseBtn").disabled = false;
        document.getElementById("resumeBtn").disabled = true;
        addLog("▶️ RESUMED", "info");
      }
      function startSim() {
        if (running) stopSim();
        resetSim();
        running = true;
        paused = false;
        document.getElementById("pauseBtn").disabled = false;
        document.getElementById("resumeBtn").disabled = true;
        if (document.getElementById("autoModeCheckbox").checked) {
          getActiveSenders().forEach((s) => sendPacket(s));
          addLog("🚀 Auto mode: all active senders start", "info");
        } else if (document.getElementById("randomModeCheckbox").checked)
          startRandomMode();
        addLog("✅ Simulation started · drop only when attempt >16", "info");
      }
      function stopSim() {
        running = false;
        paused = false;
        stopRandomMode();
        clearAllBackoffTimers();
        for (let [el, anim] of activeAnimations) if (anim.cancel) anim.cancel();
        activeAnimations.clear();
        packetMovements.clear();
        document.getElementById("pauseBtn").disabled = true;
        document.getElementById("resumeBtn").disabled = true;
        addLog("⏹️ Simulation stopped", "warn");
      }

      function buildSenderActions() {
        let panel = document.getElementById("sender-action-panel");
        panel.innerHTML = "";
        senders.forEach((s) => {
          let card = document.createElement("div");
          card.className = "sender-card";
          card.setAttribute("data-sid", s.id);
          card.style.borderLeftColor = getSenderColor(s.id);
          card.innerHTML = `
            <div class="sender-row">
              <span class="sender-badge">S${s.id}</span>
              <span class="sender-status">✈️0 | ✓0 | att:0/16+</span>
              <button class="btn-send" data-id="${s.id}"><i class="fas fa-paper-plane"></i> +1</button>
            </div>
            <div class="init-collision-control">
              <label><i class="fas fa-fire"></i> Init Collisions (0-16)</label>
              <input type="number" id="initColl${s.id}" min="0" max="16" value="0" step="1">
            </div>
          `;
          panel.appendChild(card);
          const input = card.querySelector(`#initColl${s.id}`);
          input.addEventListener("change", (e) => {
            if (running) {
              addLog(
                `⛔ Cannot change initial collisions while simulation is running`,
                "warn",
              );
              e.target.value = stats[s.id].collisions;
              return;
            }
            let val = Math.min(16, Math.max(0, parseInt(e.target.value) || 0));
            e.target.value = val;
            stats[s.id].collisions = val;
            senders[s.id].attempt = val;
            stats[s.id].attemptsTotal = val;
            updateStatsDisplay();
            updateSenderStatusUI(s.id);
            addLog(
              `✏️ S${s.id} initial collisions set to ${val} (max 16)`,
              "info",
            );
          });
        });
        document
          .querySelectorAll(".btn-send")
          .forEach((btn) =>
            btn.addEventListener("click", () =>
              sendSingle(senders.find((s) => s.id == parseInt(btn.dataset.id))),
            ),
          );
      }

      function setupNetwork() {
        const net = document.getElementById("network"),
          ctrl = document.getElementById("controls");
        net.innerHTML = "";
        ctrl.innerHTML = "";
        senders = [];
        const startY = 55,
          stepY = 90;
        for (let i = 0; i < 5; i++) {
          let y = startY + i * stepY;
          let sender = { id: i, x: 55, y, attempt: 0 };
          senders.push(sender);
          let div = document.createElement("div");
          div.className = "sender";
          div.innerHTML = `<i class="fas fa-server"></i><span>S${i}</span>`;
          div.style.left = "55px";
          div.style.top = y + "px";
          div.style.backgroundColor = getSenderColor(i);
          div.style.boxShadow = `0 0 14px ${getSenderColor(i)}`;
          net.appendChild(div);
          ctrl.innerHTML += `<label><input type="checkbox" id="cb${i}" checked> S${i}</label>`;
          let line = document.createElement("div");
          line.style.position = "absolute";
          line.style.left = "125px";
          line.style.top = y + 28 + "px";
          line.style.width = busX - 125 + "px";
          line.style.height = "2px";
          line.style.background = "#2dd4bf";
          line.style.boxShadow = "0 0 4px #2dd4bf";
          net.appendChild(line);
        }
        let v = document.createElement("div");
        v.style.cssText = `position:absolute; left:${busX}px; top:35px; width:2px; height:460px; background:#2dd4bf; box-shadow:0 0 6px #2dd4bf;`;
        net.appendChild(v);
        let mainLine = document.createElement("div");
        mainLine.style.cssText = `position:absolute; left:${busX}px; top:${receiver.y}px; width:300px; height:2px; background:#2dd4bf; box-shadow:0 0 4px #2dd4bf;`;
        net.appendChild(mainLine);
        let rec = document.createElement("div");
        rec.className = "receiver";
        rec.innerHTML = `<i class="fas fa-database"></i><span>RECEIVER</span>`;
        rec.style.left = receiver.x + "px";
        rec.style.top = receiver.y - 28 + "px";
        net.appendChild(rec);
      }

      function init() {
        setupNetwork();
        buildSenderActions();
        initStats(false);
        applyInitialCollisionsFromUI();
        updateStatsDisplay();
        senders.forEach((s) => updateSenderStatusUI(s.id));
      }

      document.getElementById("startBtn").onclick = startSim;
      document.getElementById("pauseBtn").onclick = pauseSim;
      document.getElementById("resumeBtn").onclick = resumeSim;
      document.getElementById("reportBtn").onclick = () => {
        let modalDiv = document.createElement("div");
        modalDiv.className = "report-modal";
        let totalSent = 0,
          totalDelivered = 0,
          totalDropped = 0;
        for (let i = 0; i < senders.length; i++) {
          totalSent += stats[i].packetsSent;
          totalDelivered += stats[i].packetsDelivered;
          totalDropped += stats[i].dropped;
        }
        let successRate =
          totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : 0;
        let tableRows = "";
        for (let i = 0; i < senders.length; i++) {
          let st = stats[i];
          tableRows += `<tr><td><strong style="color:${getSenderColor(i)}">S${i}</strong></td><td>${st.collisions}</td><td>${st.defers}</td><td>${Math.floor(st.totalWaitMs)} ms</td><td>${st.dropped}</td><td>${st.packetsSent}</td><td>${st.packetsDelivered}</td><td>${st.attemptsTotal}</td><td>${st.packetsSent > 0 ? ((st.packetsDelivered / st.packetsSent) * 100).toFixed(1) : 0}%</td></tr>`;
        }
        modalDiv.innerHTML = `<div class="report-card"><h3><i class="fas fa-chart-pie"></i> Exponential Backoff · Drop after >16 collisions</h3><div class="report-summary"><div class="summary-item"><div class="summary-number">${collisionCount}</div><div>Total Collisions</div></div><div class="summary-item"><div class="summary-number">${totalSent}</div><div>Packets Sent</div></div><div class="summary-item"><div class="summary-number">${totalDelivered}</div><div>Delivered</div></div><div class="summary-item"><div class="summary-number">${successRate}%</div><div>Delivery Rate</div></div><div class="summary-item"><div class="summary-number">${totalDropped}</div><div>Dropped (attempt >16)</div></div></div><table class="report-table"><thead><tr><th>Sender</th><th>Collisions</th><th>Defers</th><th>Total Wait</th><th>Dropped</th><th>Sent</th><th>Delivered</th><th>Max Attempt</th><th>Success%</th></tr></thead><tbody>${tableRows}</tbody></table><button class="close-report"><i class="fas fa-times"></i> Close Report</button></div>`;
        document.body.appendChild(modalDiv);
        modalDiv.querySelector(".close-report").onclick = () =>
          modalDiv.remove();
      };
      const autoChk = document.getElementById("autoModeCheckbox"),
        randChk = document.getElementById("randomModeCheckbox");
      autoChk.onchange = () => {
        if (autoChk.checked) {
          randChk.checked = false;
          randChk.disabled = true;
          stopRandomMode();
        } else {
          randChk.disabled = false;
        }
      };
      randChk.onchange = () => {
        if (randChk.checked && !autoChk.checked && running && !paused)
          startRandomMode();
        else if (!randChk.checked) stopRandomMode();
      };
      init();