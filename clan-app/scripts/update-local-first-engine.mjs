import fs from 'node:fs';

const file = '/home/user/clan-app/_archive/web-legacy/app.js';
let content = fs.readFileSync(file, 'utf8');

const splitIndex = content.indexOf('// 21. DYNAMIC TASK BLOCKS ENGINE');
if (splitIndex !== -1) {
  content = content.slice(0, splitIndex);
}

const localFirstEngine = `// 21. LOCAL-FIRST OFFLINE TASK BLOCKS & BATTLE ALARM ENGINE
let localTasks = JSON.parse(localStorage.getItem('clan_local_tasks') || '[]');
let localAlarms = JSON.parse(localStorage.getItem('clan_local_alarms') || '[]');

if (localTasks.length === 0) {
  localTasks = [
    {
      id: 'task-1',
      title: 'بناء معمارية المشروع وربط المقابس 🏛️',
      startTime: '06:30 ص',
      endTime: '07:15 ص',
      category: 'البرمجة والتطوير',
      priority: 'CRITICAL',
      isCompleted: false,
    },
    {
      id: 'task-2',
      title: 'مراجعة مسائل الفيزياء وقوانين نيوتن ⚛️',
      startTime: '10:00 ص',
      endTime: '11:00 ص',
      category: 'العلوم والدراسة',
      priority: 'GROWTH',
      isCompleted: false,
    },
    {
      id: 'task-3',
      title: 'الرد على إيميلات الموردين والعملاء ⚡',
      startTime: '01:00 م',
      endTime: '01:20 م',
      category: 'البيزنس والعمل',
      priority: 'QUICK',
      isCompleted: true,
    }
  ];
  localStorage.setItem('clan_local_tasks', JSON.stringify(localTasks));
}

if (localAlarms.length === 0) {
  localAlarms = [
    {
      id: 'alarm-1',
      time: '05:30',
      label: 'صلاة الفجر وبداية غزو اليوم 🌅',
      days: [0, 1, 2, 3, 4, 5, 6],
      requireProof: true,
      isActive: true,
    },
    {
      id: 'alarm-2',
      time: '09:00',
      label: 'جلسة التركيز الحرجة الأولى 🎯',
      days: [0, 1, 2, 3, 4, 5, 6],
      requireProof: true,
      isActive: true,
    }
  ];
  localStorage.setItem('clan_local_alarms', JSON.stringify(localAlarms));
}

function renderDynamicTasks(tasks) {
  const container = document.getElementById('tasks-dynamic-list');
  if (!container) return;
  container.innerHTML = '';

  const list = tasks || localTasks;

  if (list.length === 0) {
    container.innerHTML = \`
      <div style="background: #141720; border: 1px dashed rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; text-align: center; color: var(--text-muted); margin-bottom: 12px;">
        <div style="font-size: 28px; margin-bottom: 8px;">📋</div>
        <div style="font-size: 14px; font-weight: 700; color: #fff;">لا توجد بلوكات مهام حالياً</div>
        <div style="font-size: 11.5px; margin-top: 4px;">اضغط على الزر أدناه لإضافة أول بلوك في جدولك</div>
      </div>
    \`;
    return;
  }

  list.forEach((task) => {
    let priorityColor = '#ef4444';
    let priorityLabel = 'حرجة 🔴';
    let sparks = '+٢٥ شرارة 💎';

    if (task.priority === 'GROWTH') {
      priorityColor = '#10b981';
      priorityLabel = 'نمو 🌱';
      sparks = '+١٥ شرارة 💎';
    } else if (task.priority === 'QUICK') {
      priorityColor = '#e5b842';
      priorityLabel = 'سريعة ⚡';
      sparks = '+١٠ شرارة 💎';
    }

    const card = document.createElement('div');
    card.className = 'task-card-pill';
    card.style.cssText = \`
      background: \${task.isCompleted ? '#0d0f17' : '#141720'};
      border: 1.2px solid \${task.isCompleted ? 'rgba(255,255,255,0.06)' : 'rgba(229,184,66,0.35)'};
      border-radius: 18px;
      padding: 16px;
      margin-bottom: 12px;
      opacity: \${task.isCompleted ? '0.75' : '1'};
    \`;

    card.innerHTML = \`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="background: \${priorityColor}22; color: \${priorityColor}; border: 1px solid \${priorityColor}66; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700;">\${priorityLabel}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">\${task.startTime || '10:00 ص'} - \${task.endTime || '11:00 ص'}</span>
          <button class="tactile" onclick="deleteTaskAction('\${task.id}')" style="background: none; border: none; color: #ef4444; font-size: 15px; cursor: pointer; padding: 0 4px;">✕</button>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
        <input type="checkbox" \${task.isCompleted ? 'checked' : ''} onchange="toggleTaskCompleteAction('\${task.id}')" style="width: 18px; height: 18px; accent-color: var(--gold-primary); cursor: pointer;">
        <div style="font-size: 15px; font-weight: 700; color: #fff; text-decoration: \${task.isCompleted ? 'line-through' : 'none'};">\${task.title}</div>
      </div>
      <div style="font-size: 11.5px; color: var(--gold-primary); margin-bottom: 12px;">\${task.category || 'البرمجة والتطوير'} · \${sparks}</div>
      \${!task.isCompleted ? \`
        <div style="display: flex; gap: 8px;">
          <button class="tactile" onclick="switchScreen('focus-config')" style="flex: 3; background: var(--gold-metallic); color: #111; font-weight: 700; font-size: 12.5px; padding: 8px 12px; border-radius: 10px; border: none; cursor: pointer;">🔥 ابدأ تركيز</button>
          <button class="tactile" onclick="decomposeTaskWithAi('\${task.title}')" style="flex: 2; background: rgba(255,255,255,0.06); border: 1px solid rgba(229,184,66,0.3); color: var(--gold-light); font-size: 11.5px; padding: 8px; border-radius: 10px; cursor: pointer;">🧩 فككها معي</button>
        </div>
      \` : ''}
    \`;
    container.appendChild(card);
  });
}

function openAddTaskModal() {
  playTactileClick();
  openModal('modal-add-task');
}

function submitNewTaskBlock() {
  const titleInput = document.getElementById('input-task-title');
  const startTime = document.getElementById('input-task-start-time')?.value || '10:00 ص';
  const endTime = document.getElementById('input-task-end-time')?.value || '11:00 ص';
  const category = document.getElementById('input-task-category')?.value || 'البرمجة والتطوير';
  const priority = document.getElementById('input-task-priority')?.value || 'CRITICAL';

  if (!titleInput || !titleInput.value.trim()) {
    showToast('يرجى كتابة اسم المهمة أولاً!');
    return;
  }

  const title = titleInput.value.trim();
  playTactileClick();

  const newTask = {
    id: 'task-' + Date.now(),
    title,
    startTime: startTime.includes('ص') || startTime.includes('م') ? startTime : startTime + ' ص',
    endTime: endTime.includes('ص') || endTime.includes('م') ? endTime : endTime + ' ص',
    category,
    priority,
    isCompleted: false,
    createdAt: new Date().toISOString(),
  };

  localTasks.unshift(newTask);
  localStorage.setItem('clan_local_tasks', JSON.stringify(localTasks));

  // 0ms instant UI rendering
  renderDynamicTasks(localTasks);
  titleInput.value = '';
  closeModal('modal-add-task');
  showToast('🚀 تم إضافة بلوك المهمة للجدول بنجاح!');

  // Background quiet server sync
  fetch('/api/tasks', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, priority, category, startTime, endTime }),
  }).catch(() => {});

  // Pre-task reminder
  setTimeout(() => {
    triggerPreTaskReminder(title, category);
  }, 4000);
}

function toggleTaskCompleteAction(taskId) {
  playTactileClick();
  const task = localTasks.find(t => t.id === taskId);
  if (task) {
    task.isCompleted = !task.isCompleted;
    localStorage.setItem('clan_local_tasks', JSON.stringify(localTasks));
    renderDynamicTasks(localTasks);

    if (task.isCompleted) {
      showToast('🎉 عاش يا بطل! تم إنجاز المهمة وحصد الشرارات 💎!');
      fetch(\`/api/tasks/\${taskId}\`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isCompleted: true }),
      }).catch(() => {});
    }
  }
}

function deleteTaskAction(taskId) {
  playTactileClick();
  localTasks = localTasks.filter(t => t.id !== taskId);
  localStorage.setItem('clan_local_tasks', JSON.stringify(localTasks));
  renderDynamicTasks(localTasks);
  showToast('تم حذف المهمة');

  fetch(\`/api/tasks/\${taskId}\`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }).catch(() => {});
}

// ════════════════════════════════════════════════════════════════════
// 22. LOCAL-FIRST BATTLE ALARMS ENGINE
// ════════════════════════════════════════════════════════════════════

function renderDynamicAlarms(alarms) {
  const container = document.getElementById('alarms-dynamic-list');
  if (!container) return;
  container.innerHTML = '';

  const list = alarms || localAlarms;

  if (list.length === 0) {
    container.innerHTML = \`
      <div style="background: #101218; border: 1px dashed rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; text-align: center; color: var(--text-muted);">
        <div style="font-size: 28px; margin-bottom: 8px;">⏰</div>
        <div style="font-size: 14px; font-weight: 700; color: #fff;">لا توجد منبهات مجدولة حالياً</div>
        <div style="font-size: 11.5px; margin-top: 4px;">اضغط على زر "+ ضبط منبه جديد" للبدء</div>
      </div>
    \`;
    return;
  }

  list.forEach((alarm) => {
    const card = document.createElement('div');
    card.style.cssText = \`
      background: #141720;
      border: 1.2px solid \${alarm.isActive ? 'rgba(229,184,66,0.4)' : 'rgba(255,255,255,0.08)'};
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.5);
    \`;

    card.innerHTML = \`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-family: var(--font-mono); font-size: 26px; font-weight: 800; color: var(--gold-primary);">\${alarm.time}</span>
        <div style="display: flex; align-items: center; gap: 10px;">
          <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
            <input type="checkbox" \${alarm.isActive ? 'checked' : ''} onchange="toggleAlarmActiveAction('\${alarm.id}', this.checked)" style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: \${alarm.isActive ? 'var(--gold-primary)' : 'rgba(255,255,255,0.15)'}; border-radius: 24px; transition: .3s;"></span>
          </label>
          <button class="tactile" onclick="deleteAlarmAction('\${alarm.id}')" style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; border-radius: 8px; padding: 4px 8px; font-size: 12px; cursor: pointer;">حذف 🗑️</button>
        </div>
      </div>
      <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px;">\${alarm.label || 'صلاة الفجر وبداية غزو اليوم 🌅'}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">تكرار أسبوعي · 📸 \${alarm.requireProof ? 'إثبات استيقاظ بتصوير الكوب (+١٠ 💎)' : 'عادي'}</div>
      
      <button class="tactile" onclick="triggerTurkeyAlarmModal()" style="width: 100%; background: rgba(229,184,66,0.12); border: 1px solid var(--gold-primary); color: var(--gold-light); font-weight: 700; font-size: 12.5px; padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;">
        <span>🔔 تجربة سكتش الرنين الصارم الآن 🦃</span>
      </button>
    \`;
    container.appendChild(card);
  });
}

function openAddAlarmModal() {
  playTactileClick();
  openModal('modal-add-alarm');
}

function toggleAlarmDay(chip) {
  playTactileClick();
  chip.classList.toggle('active');
}

function submitNewBattleAlarm() {
  const timeInput = document.getElementById('input-alarm-time');
  const labelInput = document.getElementById('input-alarm-label');
  const proofSelect = document.getElementById('input-alarm-proof');

  if (!timeInput || !timeInput.value) {
    showToast('يرجى تحديد وقت المنبه!');
    return;
  }

  playTactileClick();
  const time = timeInput.value;
  const label = labelInput?.value?.trim() || 'صلاة الفجر والتركيز الصباحي 🌅';
  const requireProof = proofSelect?.value === 'PHOTO_WATER';

  const activeChips = document.querySelectorAll('#alarm-days-picker .day-chip.active');
  const selectedDays = Array.from(activeChips).map(c => Number(c.getAttribute('data-day'))).sort((a,b)=>a-b);
  const days = selectedDays.length > 0 ? selectedDays : [0, 1, 2, 3, 4, 5, 6];

  const newAlarm = {
    id: 'alarm-' + Date.now(),
    time,
    label,
    days,
    requireProof,
    isActive: true,
  };

  localAlarms.unshift(newAlarm);
  localStorage.setItem('clan_local_alarms', JSON.stringify(localAlarms));

  // 0ms instant UI rendering
  renderDynamicAlarms(localAlarms);
  closeModal('modal-add-alarm');
  showToast('⏰ تم ضبط وتثبيت المنبه بنجاح!');

  // Background quiet server sync
  fetch('/api/alarms', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ time, days, label, requireProof }),
  }).catch(() => {});
}

function toggleAlarmActiveAction(alarmId, isActive) {
  playTactileClick();
  const alarm = localAlarms.find(a => a.id === alarmId);
  if (alarm) {
    alarm.isActive = isActive;
    localStorage.setItem('clan_local_alarms', JSON.stringify(localAlarms));
    renderDynamicAlarms(localAlarms);
    showToast(isActive ? '✅ تم تفعيل المنبه' : 'تم تعطيل المنبه');

    fetch(\`/api/alarms/\${alarmId}\`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ isActive }),
    }).catch(() => {});
  }
}

function deleteAlarmAction(alarmId) {
  playTactileClick();
  localAlarms = localAlarms.filter(a => a.id !== alarmId);
  localStorage.setItem('clan_local_alarms', JSON.stringify(localAlarms));
  renderDynamicAlarms(localAlarms);
  showToast('تم حذف المنبه');

  fetch(\`/api/alarms/\${alarmId}\`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }).catch(() => {});
}

// ════════════════════════════════════════════════════════════════════
// 23. PRE-TASK REMINDER & POST-TASK CHECK-IN POPUPS
// ════════════════════════════════════════════════════════════════════

function triggerPreTaskReminder(title, category) {
  playAlertBeep();
  const titleEl = document.getElementById('pre-task-title');
  const banterEl = document.getElementById('pre-task-banter');
  const tipEl = document.getElementById('pre-task-tip');

  if (titleEl) titleEl.textContent = \`مهمة: \${title}\`;

  if (category && category.includes('الفيزياء')) {
    if (banterEl) banterEl.textContent = 'إيه يا نجم النجوم؟ فاضل ١٠ دقائق والديك الرومي بيسخن! ⚛️';
    if (tipEl) tipEl.textContent = 'نصيحة أخوية سريعة: اكتب القوانين ووحدات التحويل في ورقة خارجية على جنب الأول عشان دماغك ما تتسحلش في الحسابات!';
  } else if (category && category.includes('الرياضة')) {
    if (banterEl) banterEl.textContent = 'يا كابتن مصر! الجيم مستنيك ورجلك بقت أرفع من قلم الرصاص! 🏋️';
    if (tipEl) tipEl.textContent = 'نصيحة قبل ما تنزل: اشرب كوباية مية كبيرة دلوقتي وخد موزة عشان أجهزة الجيم ما تتفرجش عليك وأنت بتدوخ!';
  } else {
    if (banterEl) banterEl.textContent = 'يا باشمهندس يا كبير! فاضل ١٠ دقائق على بداية المهمة 💻';
    if (tipEl) tipEl.textContent = 'تريكة برمجية: لو وقف قصادك Bug أكتر من 10 دقائق، امسك ورقة وقلم واكتب الـ Logic برة الكومبيوتر!';
  }

  openModal('modal-pre-task-reminder');
}

function triggerPostTaskCheckin(title) {
  playAlertBeep();
  const titleEl = document.getElementById('post-task-title');
  const qEl = document.getElementById('post-task-question');
  if (titleEl) titleEl.textContent = \`انتهت مهمة [\${title}] من شوية\`;
  if (qEl) qEl.textContent = \`ها يا بطل! خلصت مهمة [\${title}] من شوية.. طمني عملت إيه؟ ⚽\`;
  openModal('modal-post-task-checkin');
}

async function submitPostTaskCheckinReply() {
  const input = document.getElementById('post-task-user-reply');
  if (!input || !input.value.trim()) {
    closeModal('modal-post-task-checkin');
    return;
  }

  const reply = input.value.trim();
  input.value = '';
  playTactileClick();
  closeModal('modal-post-task-checkin');

  handleTabNavigation('ai-chat');
  appendAiScreenChatMessage('محمود (أنت)', reply, true);

  try {
    const res = await fetch('/api/ai/message', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        message: reply,
        localContext: {
          tasks: localTasks,
          alarms: localAlarms,
        }
      }),
    });
    const data = await res.json();
    const aiText = data.message?.content || data.reply || 'أنا معاك يا بطل ومعاك في كل خطوة!';
    appendAiScreenChatMessage('المرافق الذكي', aiText, false);
  } catch (_) {
    appendAiScreenChatMessage('المرافق الذكي', 'أيوة بقى يا حريف! 👑 عاش يا بطل واشحن طاقتك للخطوة الجاية!', false);
  }
}

// ════════════════════════════════════════════════════════════════════
// 24. DEDICATED AI CHAT SCREEN ENGINE WITH LOCAL CONTEXT PAYLOAD
// ════════════════════════════════════════════════════════════════════

async function sendAiScreenUserMessage() {
  const input = document.getElementById('ai-screen-chat-input');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  playTactileClick();
  appendAiScreenChatMessage('محمود (أنت)', text, true);

  try {
    const res = await fetch('/api/ai/message', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        message: text,
        localContext: {
          tasks: localTasks,
          alarms: localAlarms,
        }
      }),
    });
    const data = await res.json();
    const aiText = data.message?.content || data.reply || 'أنا جنبك يا رفيق ومعاك في كل خطوة!';
    appendAiScreenChatMessage('المرافق الذكي', aiText, false);
  } catch (_) {
    appendAiScreenChatMessage('المرافق الذكي', 'أنا جنبك يا رفيق ومعاك في كل خطوة! يلا نكمل خطتنا 🚀', false);
  }
}

function appendAiScreenChatMessage(sender, text, isUser) {
  const container = document.getElementById('ai-screen-chat-messages');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.style.cssText = \`
    background: \${isUser ? 'rgba(229,184,66,0.15)' : '#141720'};
    border: 1px solid \${isUser ? 'rgba(229,184,66,0.3)' : 'rgba(255,255,255,0.08)'};
    border-radius: 16px;
    padding: 12px 14px;
    text-align: right;
    margin-bottom: 6px;
  \`;
  msgEl.innerHTML = \`
    <div style="font-size: 11.5px; font-weight: 700; color: \${isUser ? 'var(--gold-primary)' : 'var(--gold-light)'}; margin-bottom: 4px;">\${sender}</div>
    <div style="font-size: 13.5px; color: #fff; line-height: 1.45; white-space: pre-line;">\${text}</div>
  \`;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

// Initial boot render
document.addEventListener('DOMContentLoaded', () => {
  renderDynamicTasks(localTasks);
  renderDynamicAlarms(localAlarms);
});

// Expose functions globally
window.localTasks = localTasks;
window.localAlarms = localAlarms;
window.renderDynamicTasks = renderDynamicTasks;
window.renderDynamicAlarms = renderDynamicAlarms;
window.openAddTaskModal = openAddTaskModal;
window.submitNewTaskBlock = submitNewTaskBlock;
window.toggleTaskCompleteAction = toggleTaskCompleteAction;
window.deleteTaskAction = deleteTaskAction;
window.openAddAlarmModal = openAddAlarmModal;
window.toggleAlarmDay = toggleAlarmDay;
window.submitNewBattleAlarm = submitNewBattleAlarm;
window.toggleAlarmActiveAction = toggleAlarmActiveAction;
window.deleteAlarmAction = deleteAlarmAction;
window.triggerPreTaskReminder = triggerPreTaskReminder;
window.triggerPostTaskCheckin = triggerPostTaskCheckin;
window.submitPostTaskCheckinReply = submitPostTaskCheckinReply;
window.sendAiScreenUserMessage = sendAiScreenUserMessage;
`;

fs.writeFileSync(file, content + '\n' + localFirstEngine, 'utf8');
console.log('✅ Updated _archive/web-legacy/app.js with Local-First Offline Engine successfully!');
