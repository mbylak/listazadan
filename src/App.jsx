import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Settings, Plus, ChevronUp, ChevronDown, 
  Play, Check, Square, CheckSquare, Download, Tag, 
  AlignLeft, Trash2, X, ListTodo, CalendarDays, StopCircle, ArrowLeft,
  Repeat, Flame, Target
} from 'lucide-react';

// --- Minimalist Markdown Parser ---
const parseMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-3">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/~~(.*?)~~/gim, '<del>$1</del>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/gim, '<br/>');
  return { __html: html };
};

import { supabase } from './supabaseClient';

export default function App() {
  // --- CLOCK & DATE ---
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentTime.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  const formattedTime = currentTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  // --- STATE MANAGEMENT ---
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([
    { id: 'cat_1', name: 'Praca', color: '#0078D4' },
    { id: 'cat_2', name: 'Dom', color: '#107C10' },
    { id: 'cat_3', name: 'Nauka', color: '#D83B01' }
  ]);
  const [settings, setSettings] = useState({
    timeTrackingEnabled: true,
    themeMode: 'auto' // 'auto', 'light', 'dark'
  });
  const [habits, setHabits] = useState([]);
  
  const [activeTab, setActiveTab] = useState('today'); // 'today', 'tomorrow', 'habits'
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Mobile View Management
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);

  // Zmienna dla alertu o przerwie
  const [showBreakPopup, setShowBreakPopup] = useState(false);
  const breakPopupShownRef = useRef(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const skipNextSync = useRef(false);
  const lastLocalUpdateTime = useRef(null);

  // SUPABASE: Wczytywanie z chmury przy starcie i subskrypcja zmian
  useEffect(() => {
    const loadData = async () => {
      if (!supabase) {
        // Fallback do localStorage jeśli brak Supabase
        const savedTasks = localStorage.getItem('fluent_tasks_v2');
        const savedCats = localStorage.getItem('fluent_cats_v2');
        const savedSet = localStorage.getItem('fluent_settings_v2');
        const savedHabits = localStorage.getItem('fluent_habits_v2');
        if (savedTasks) setTasks(JSON.parse(savedTasks));
        if (savedCats) setCategories(JSON.parse(savedCats));
        if (savedSet) setSettings(JSON.parse(savedSet));
        if (savedHabits) setHabits(JSON.parse(savedHabits));
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('app_state')
          .select('*')
          .eq('user_id', 'michal_bylak')
          .single();

        if (data) {
          skipNextSync.current = true;
          if (data.tasks) setTasks(data.tasks);
          if (data.categories) setCategories(data.categories);
          if (data.settings) setSettings(data.settings);
          if (data.habits) setHabits(data.habits);
        }
      } catch (err) {
        console.error("Błąd wczytywania z Supabase", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    if (supabase) {
      const channel = supabase
        .channel('public:app_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: 'user_id=eq.michal_bylak' }, payload => {
           const newRecord = payload.new;
           // Ignoruj zdarzenia wywołane naszym własnym zapisem
           if (lastLocalUpdateTime.current && newRecord?.updated_at === lastLocalUpdateTime.current) {
             return;
           }
           // Zmiana z innego urządzenia — zastosuj
           skipNextSync.current = true;
           if (newRecord?.tasks) setTasks(newRecord.tasks);
           if (newRecord?.categories) setCategories(newRecord.categories);
           if (newRecord?.settings) setSettings(newRecord.settings);
           if (newRecord?.habits) setHabits(newRecord.habits);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, []);

  // SUPABASE: Zapisywanie do chmury przy zmianach lokalnych
  useEffect(() => {
    if (isLoading) return; // Nie synchronizuj pustych danych podczas ładowania
    
    // Zawsze zapisuj kopię zapasową do localStorage
    localStorage.setItem('fluent_tasks_v2', JSON.stringify(tasks));
    localStorage.setItem('fluent_cats_v2', JSON.stringify(categories));
    localStorage.setItem('fluent_settings_v2', JSON.stringify(settings));
    localStorage.setItem('fluent_habits_v2', JSON.stringify(habits));

    if (skipNextSync.current) {
        skipNextSync.current = false;
        return; // Pomijamy wysyłanie do bazy, jeśli zmiana przyszła z bazy
    }

    if (supabase) {
      const syncToCloud = async () => {
         const timestamp = new Date().toISOString();
         lastLocalUpdateTime.current = timestamp;
         await supabase.from('app_state').upsert({
            user_id: 'michal_bylak',
            tasks,
            categories,
            settings,
            habits,
            updated_at: timestamp
         });
      };
      
      // Delikatne opóźnienie wysyłania (debounce) by nie obciążać zbytnio bazy
      const timeoutId = setTimeout(() => {
         syncToCloud();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [tasks, categories, settings, habits, isLoading]);


  // --- THEME MANAGEMENT ---
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const updateTheme = () => {
      if (settings.themeMode === 'auto') {
        const hour = new Date().getHours();
        setIsDark(hour >= 19 || hour < 7);
      } else {
        setIsDark(settings.themeMode === 'dark');
      }
    };
    
    updateTheme();
    const intervalId = setInterval(updateTheme, 60000); 
    return () => clearInterval(intervalId);
  }, [settings.themeMode]);


  // --- DERIVED STATE ---
  // Aktualizacja tytułu karty przeglądarki na żywo
  useEffect(() => {
    const runningTask = tasks.find(t => t.isRunning);
    if (runningTask && runningTask.startTime) {
       const elapsedMs = (runningTask.durationMs || 0) + (currentTime.getTime() - runningTask.startTime);
       const totalSeconds = Math.floor(elapsedMs / 1000);
       
       // Dopuszczamy >59 minut żeby pokazywało np. 85:12, jeśli to celowe, lub przeliczamy na HH:MM:SS
       // Żądanie: "30:12 - (Nazwa zadania)"
       const h = Math.floor(totalSeconds / 3600);
       const m = Math.floor((totalSeconds % 3600) / 60);
       const s = totalSeconds % 60;
       
       const timeString = h > 0 
           ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
           : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
           
       document.title = `${timeString} - ${runningTask.title}`;
       
       // Alert o 90-minutowej pracy (1.5h)
       const totalMinutes = totalSeconds / 60;
       if (totalMinutes >= 90 && !breakPopupShownRef.current.has(runningTask.id)) {
           setShowBreakPopup(true);
           breakPopupShownRef.current.add(runningTask.id);
       } else if (totalMinutes < 90 && breakPopupShownRef.current.has(runningTask.id)) {
           // Jeżeli czas został zedytowany ręcznie do wartości < 90m
           breakPopupShownRef.current.delete(runningTask.id);
       }
    } else {
       document.title = "Zadania";
    }
  }, [tasks, currentTime]);

  const totalTodayMinutes = useMemo(() => {
    let totals = 0;
    tasks.filter(t => t.date === 'today').forEach(t => {
      totals += (t.durationMs || 0);
      if (t.isRunning && t.startTime) {
         totals += (currentTime.getTime() - t.startTime);
      }
    });
    return Math.floor(totals / 60000);
  }, [tasks, currentTime]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => t.date === activeTab)
      .sort((a, b) => a.order - b.order);
  }, [tasks, activeTab]);

  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId);
  }, [tasks, selectedTaskId]);

  // Handle mobile selection
  const handleSelectTask = (id) => {
    setSelectedTaskId(id);
    setIsMobileDetailView(true);
  };

  const handleBackToList = () => {
    setIsMobileDetailView(false);
    setTimeout(() => setSelectedTaskId(null), 150);
  };

  // --- ACTIONS ---
  const addTask = (e) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    const newOrder = filteredTasks.length > 0 
      ? Math.max(...filteredTasks.map(t => t.order)) + 1 
      : 0;

    const newTask = {
      id: Date.now().toString(),
      title: newTaskTitle.trim(),
      date: activeTab,
      completed: false,
      description: '',
      subtasks: [],
      categoryId: null,
      order: newOrder,
      startTime: null,
      durationMs: 0,
      isRunning: false
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    if (window.innerWidth > 768) {
       setSelectedTaskId(newTask.id);
    }
  };

  const updateTask = (id, updates) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const deleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setIsMobileDetailView(false);
    setSelectedTaskId(null);
  };

  const toggleTaskComplete = (task, e) => {
    if (e) e.stopPropagation();
    let updates = { completed: !task.completed };
    
    if (!task.completed && task.isRunning && settings.timeTrackingEnabled) {
      const now = Date.now();
      const elapsed = now - task.startTime;
      updates.isRunning = false;
      updates.durationMs = (task.durationMs || 0) + elapsed;
      updates.startTime = null;
    }

    updateTask(task.id, updates);
  };

  const toggleTimer = (task) => {
    if (!settings.timeTrackingEnabled || task.completed) return;
    
    if (task.isRunning) {
      const now = Date.now();
      const elapsed = now - task.startTime;
      updateTask(task.id, {
        isRunning: false,
        durationMs: (task.durationMs || 0) + elapsed,
        startTime: null
      });
    } else {
      updateTask(task.id, {
        isRunning: true,
        startTime: Date.now()
      });
    }
  };

  const moveTask = (id, direction, e) => {
    if (e) e.stopPropagation();
    const currentIndex = filteredTasks.findIndex(t => t.id === id);
    if (currentIndex < 0) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= filteredTasks.length) return;

    const targetTask = filteredTasks[targetIndex];
    const currentTask = filteredTasks[currentIndex];

    setTasks(prev => prev.map(t => {
      if (t.id === currentTask.id) return { ...t, order: targetTask.order };
      if (t.id === targetTask.id) return { ...t, order: currentTask.order };
      return t;
    }));
  };

  // --- SUBTASKS ---
  const addSubtask = (taskId, title) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !title.trim()) return;
    const newSub = { id: Date.now().toString(), title: title.trim(), completed: false };
    updateTask(taskId, { subtasks: [...task.subtasks, newSub] });
  };

  const toggleSubtaskComplete = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedSubs = task.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
    updateTask(taskId, { subtasks: updatedSubs });
  };

  const deleteSubtask = (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    updateTask(taskId, { subtasks: task.subtasks.filter(s => s.id !== subtaskId) });
  };

  // --- CSV EXPORT ---
  const exportCSV = () => {
    const headers = ['ID', 'Tytul', 'Data', 'Ukonczone', 'Kategoria', 'Czas pracy (minuty)', 'Opis'];
    const rows = tasks.map(t => {
      const catName = categories.find(c => c.id === t.categoryId)?.name || '';
      let totalTimeMs = t.durationMs || 0;
      if (t.isRunning && t.startTime) {
        totalTimeMs += (Date.now() - t.startTime);
      }
      const timeMinutes = (totalTimeMs / 60000).toFixed(2);
      
      return [
        t.id,
        `"${t.title.replace(/"/g, '""')}"`,
        t.date,
        t.completed ? 'Tak' : 'Nie',
        `"${catName}"`,
        timeMinutes,
        `"${t.description.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `checklist_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // --- HABITS HELPERS ---
  const dayNamesShort = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

  const formatDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const todayKey = formatDateKey(new Date());

  const weekDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dow === 0 ? 7 : dow) - 1));
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [todayKey]);

  const shouldTrackDay = (habit, date) => {
    const dow = date.getDay();
    switch (habit.frequency) {
      case 'daily': return true;
      case 'workdays': return dow >= 1 && dow <= 5;
      case 'every2days': {
        const created = new Date(habit.createdAt);
        created.setHours(0,0,0,0);
        const diff = Math.floor((date.getTime() - created.getTime()) / 86400000);
        return diff % 2 === 0;
      }
      case 'ndays': return true;
      default: return true;
    }
  };

  const getHabitStreak = (habit) => {
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let checkDate = new Date(today);
    let gracesUsed = 0;
    const maxGraces = habit.allowGracePeriod ? 1 : 0;
    for (let i = 0; i < 400; i++) {
      const key = formatDateKey(checkDate);
      if (!shouldTrackDay(habit, checkDate)) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      if (habit.completions?.[key]) {
        streak++;
      } else if (gracesUsed < maxGraces) {
        gracesUsed++;
      } else {
        break;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  };

  const getHabitConsistency = (habit) => {
    const created = new Date(habit.createdAt);
    created.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let totalDays = 0;
    let completedDays = 0;
    let checkDate = new Date(created);
    while (checkDate <= today) {
      if (shouldTrackDay(habit, checkDate)) {
        totalDays++;
        if (habit.completions?.[formatDateKey(checkDate)]) completedDays++;
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return { totalDays, completedDays, ratio: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0 };
  };

  const toggleHabitDay = (habitId, dateKey) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const completions = { ...h.completions };
      if (completions[dateKey]) { delete completions[dateKey]; } else { completions[dateKey] = true; }
      return { ...h, completions };
    }));
  };

  const addHabit = () => {
    setHabits(prev => [...prev, {
      id: 'habit_' + Date.now(),
      name: 'Nowy nawyk',
      color: '#0078D4',
      frequency: 'daily',
      nDaysTarget: 3,
      goalMinutes: 0,
      allowGracePeriod: false,
      completions: {},
      createdAt: formatDateKey(new Date())
    }]);
  };

  const updateHabit = (id, updates) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
  };

  const deleteHabit = (id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const exportHabitsCSV = () => {
    const headers = ['Nawyk', 'Częstotliwość', 'Dni wykonane', 'Dni śledzono', 'Konsekwencja (%)'];
    const freqNames = { daily: 'Codziennie', workdays: 'Dni robocze', every2days: 'Co 2 dni', ndays: 'N dni/tydz.' };
    const rows = habits.map(h => {
      const { totalDays, completedDays, ratio } = getHabitConsistency(h);
      return [
        `"${h.name}"`,
        freqNames[h.frequency] || h.frequency,
        completedDays,
        totalDays,
        ratio
      ].join(',');
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `nawyki_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // --- STYLES (Fluent UI Tokens) ---
  const themeClasses = isDark ? 'bg-[#202020] text-gray-100' : 'bg-[#F3F3F3] text-gray-900';
  const sidebarClasses = isDark ? 'bg-[#282828] border-[#333]' : 'bg-[#FAFAFA] border-gray-200';
  const cardClasses = isDark ? 'bg-[#2D2D2D] border-[#3D3D3D] hover:bg-[#323232]' : 'bg-white border-gray-100 shadow-sm hover:bg-gray-50';
  const activeCardClasses = isDark ? 'bg-[#333333] border-[#0078D4]' : 'bg-[#F0F6FF] border-[#0078D4]';
  const buttonPrimaryClasses = 'bg-[#0078D4] hover:bg-[#006CBE] text-white rounded-md transition-colors';
  const buttonSubtleClasses = isDark ? 'hover:bg-[#3D3D3D] text-gray-300' : 'hover:bg-gray-200 text-gray-600';


  return (
    <div 
      className={`fixed inset-0 h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden ${themeClasses}`}
      style={{ fontFamily: '"Segoe UI Variable", "Segoe UI", "Helvetica Neue", sans-serif' }}
    >
      {/* --- TOP BAR (Mobile + Desktop Clock) --- */}
      <div className={`w-full p-4 flex items-center justify-between border-b md:hidden z-20 shadow-sm flex-shrink-0 ${sidebarClasses}`}>
         {isMobileDetailView ? (
           <button onClick={handleBackToList} className={`p-2 rounded-xl flex items-center gap-2 ${buttonSubtleClasses}`}>
             <ArrowLeft size={20} /> Wróć
           </button>
         ) : (
           <div className="flex flex-col">
             <span className="text-xs opacity-60 uppercase tracking-wider font-semibold">{formattedDate}</span>
             <span className="text-xl font-bold">{formattedTime}</span>
           </div>
         )}
         <button onClick={() => setIsSettingsOpen(true)} className={`p-2 rounded-xl ${buttonSubtleClasses}`}>
            <Settings size={22} />
         </button>
      </div>

      {/* --- SIDEBAR NAV (Desktop Only) --- */}
      <nav className={`hidden md:flex w-16 flex-col items-center py-6 border-r z-20 flex-shrink-0 ${sidebarClasses}`}>
        <button 
          onClick={() => { setActiveTab('today'); setIsMobileDetailView(false); setSelectedTaskId(null); }}
          className={`p-3 rounded-xl mb-4 transition-all ${activeTab === 'today' ? 'bg-[#0078D4] text-white shadow-md' : buttonSubtleClasses}`}
          title="Dzisiaj"
        >
          <CalendarDays size={22} />
        </button>
        <button 
          onClick={() => { setActiveTab('tomorrow'); setIsMobileDetailView(false); setSelectedTaskId(null); }}
          className={`p-3 rounded-xl transition-all ${activeTab === 'tomorrow' ? 'bg-[#0078D4] text-white shadow-md' : buttonSubtleClasses}`}
          title="Jutro"
        >
          <ListTodo size={22} />
        </button>
        <button 
          onClick={() => { setActiveTab('habits'); setIsMobileDetailView(false); setSelectedTaskId(null); }}
          className={`p-3 rounded-xl mt-4 transition-all ${activeTab === 'habits' ? 'bg-[#0078D4] text-white shadow-md' : buttonSubtleClasses}`}
          title="Nawyki"
        >
          <Repeat size={22} />
        </button>
        
        <div className="flex-grow" />
        
        {/* Desktop Clock Tooltip */}
        <div className="mb-4 text-center px-1">
          <div className="text-[10px] opacity-60 font-medium leading-tight mb-1">{formattedDate}</div>
          <div className="text-xs font-bold">{formattedTime}</div>
        </div>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          className={`p-3 rounded-xl transition-all ${buttonSubtleClasses}`}
          title="Ustawienia"
        >
          <Settings size={22} />
        </button>
      </nav>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* --- HABITS VIEW --- */}
        {activeTab === 'habits' && (
          <div className="flex-1 overflow-y-auto p-5 md:p-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                  <Repeat size={28} className="text-[#0078D4]" /> Nawyki
                </h1>
                <div className="flex gap-2">
                  <button
                    onClick={exportHabitsCSV}
                    className={`p-2.5 rounded-xl border transition-colors ${isDark ? 'border-[#3D3D3D] hover:bg-[#333]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'}`}
                    title="Eksportuj raport nawyków"
                  >
                    <Download size={18} />
                  </button>
                  <button
                    onClick={addHabit}
                    className={`px-4 py-2.5 rounded-xl flex items-center gap-2 font-semibold text-sm ${buttonPrimaryClasses}`}
                  >
                    <Plus size={16} /> Dodaj nawyk
                  </button>
                </div>
              </div>

              {habits.length === 0 ? (
                <div className={`text-center py-16 rounded-2xl border ${isDark ? 'bg-[#2D2D2D] border-[#3D3D3D]' : 'bg-white border-gray-200 shadow-sm'}`}>
                  <Repeat size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium opacity-50">Brak nawyków</p>
                  <p className="text-sm opacity-40 mt-1">Dodaj pierwszy nawyk, aby zacząć śledzenie</p>
                </div>
              ) : (
                <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-[#2D2D2D] border-[#3D3D3D]' : 'bg-white border-gray-200 shadow-sm'}`}>
                  {/* Header row with dates */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-[#3D3D3D]' : 'border-gray-100'}`}>
                          <th className="text-left p-4 font-semibold text-sm w-[200px]">Nawyk</th>
                          {weekDates.map((date, i) => {
                            const dateKey = formatDateKey(date);
                            const isToday = dateKey === todayKey;
                            return (
                              <th key={i} className={`p-2 text-center min-w-[52px] ${isToday ? 'bg-[#0078D4]/10' : ''}`}>
                                <div className={`text-lg font-bold ${isToday ? 'text-[#0078D4]' : ''}`}>{date.getDate()}</div>
                                <div className={`text-[10px] uppercase tracking-wider font-medium ${isToday ? 'text-[#0078D4]' : 'opacity-50'}`}>{dayNamesShort[i]}</div>
                              </th>
                            );
                          })}
                          <th className="p-2 text-center min-w-[80px]">
                            <div className="text-[10px] uppercase tracking-wider font-medium opacity-50">Seria</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {habits.map(habit => {
                          const streak = getHabitStreak(habit);
                          const { ratio } = getHabitConsistency(habit);
                          return (
                            <tr key={habit.id} className={`border-b last:border-0 ${isDark ? 'border-[#3D3D3D]' : 'border-gray-50'}`}>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: habit.color }} />
                                  <span className="font-medium text-[14px] truncate">{habit.name}</span>
                                </div>
                                <div className="text-[10px] opacity-40 mt-0.5 ml-[18px]">{ratio}% konsekwencji</div>
                              </td>
                              {weekDates.map((date, i) => {
                                const dateKey = formatDateKey(date);
                                const isToday = dateKey === todayKey;
                                const done = habit.completions?.[dateKey];
                                const tracked = shouldTrackDay(habit, date);
                                const isPast = date <= new Date();
                                return (
                                  <td key={i} className={`p-1 text-center ${isToday ? 'bg-[#0078D4]/10' : ''}`}>
                                    {tracked ? (
                                      <button
                                        onClick={() => toggleHabitDay(habit.id, dateKey)}
                                        className={`w-9 h-9 rounded-xl mx-auto flex items-center justify-center transition-all text-lg
                                          ${done 
                                            ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' 
                                            : isPast 
                                              ? `${isDark ? 'bg-red-500/10 text-red-400/60 hover:bg-red-500/20' : 'bg-red-50 text-red-300 hover:bg-red-100'}` 
                                              : `${isDark ? 'bg-[#333] hover:bg-[#3D3D3D] text-gray-600' : 'bg-gray-50 hover:bg-gray-100 text-gray-300'}`
                                          }`}
                                      >
                                        {done ? '✓' : isPast ? '✗' : '·'}
                                      </button>
                                    ) : (
                                      <div className="w-9 h-9 mx-auto flex items-center justify-center text-gray-300 dark:text-gray-600 text-xs">—</div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {streak >= 21 && <span>🎯</span>}
                                  {streak >= 7 && streak < 21 && <Flame size={14} className="text-orange-500" />}
                                  <span className={`text-sm font-bold ${streak >= 21 ? 'text-[#0078D4]' : streak >= 7 ? 'text-orange-500' : streak > 0 ? 'text-green-500' : 'opacity-30'}`}>
                                    {streak}
                                  </span>
                                  {streak >= 21 && <span className="text-[10px] font-bold text-[#0078D4] ml-0.5">{streak} dni!</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Habit Detail Cards */}
              {habits.length > 0 && (
                <div className="mt-8 space-y-4">
                  <h2 className="text-sm font-semibold opacity-60 uppercase tracking-wider flex items-center gap-2">
                    <Settings size={14} /> Konfiguracja nawyków
                  </h2>
                  {habits.map(habit => {
                    const { totalDays, completedDays, ratio } = getHabitConsistency(habit);
                    return (
                      <div key={habit.id} className={`p-4 rounded-2xl border ${isDark ? 'bg-[#2D2D2D] border-[#3D3D3D]' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="color"
                            value={habit.color}
                            onChange={(e) => updateHabit(habit.id, { color: e.target.value })}
                            className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent mt-1 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={habit.name}
                              onChange={(e) => updateHabit(habit.id, { name: e.target.value })}
                              className="bg-transparent outline-none font-semibold text-[16px] w-full border-b border-transparent focus:border-[#0078D4] transition-colors pb-1"
                            />
                            <div className="flex flex-wrap gap-3 mt-3">
                              <div className="flex-1 min-w-[140px]">
                                <label className="text-[10px] uppercase font-semibold opacity-50 tracking-wider block mb-1">Częstotliwość</label>
                                <select
                                  value={habit.frequency}
                                  onChange={(e) => updateHabit(habit.id, { frequency: e.target.value })}
                                  className={`w-full p-2 rounded-lg text-sm border outline-none ${isDark ? 'bg-[#333] border-[#444]' : 'bg-gray-50 border-gray-200'}`}
                                >
                                  <option value="daily">Codziennie</option>
                                  <option value="workdays">Dni robocze</option>
                                  <option value="every2days">Co 2 dni</option>
                                  <option value="ndays">N dni w tygodniu</option>
                                </select>
                              </div>
                              {habit.frequency === 'ndays' && (
                                <div className="min-w-[100px]">
                                  <label className="text-[10px] uppercase font-semibold opacity-50 tracking-wider block mb-1">Ile dni/tydz.</label>
                                  <input
                                    type="number" min="1" max="7"
                                    value={habit.nDaysTarget || 3}
                                    onChange={(e) => updateHabit(habit.id, { nDaysTarget: parseInt(e.target.value) || 3 })}
                                    className={`w-full p-2 rounded-lg text-sm border outline-none ${isDark ? 'bg-[#333] border-[#444]' : 'bg-gray-50 border-gray-200'}`}
                                  />
                                </div>
                              )}
                              <div className="min-w-[120px]">
                                <label className="text-[10px] uppercase font-semibold opacity-50 tracking-wider block mb-1">Cel (minuty)</label>
                                <input
                                  type="number" min="0"
                                  value={habit.goalMinutes || 0}
                                  onChange={(e) => updateHabit(habit.id, { goalMinutes: parseInt(e.target.value) || 0 })}
                                  placeholder="0 = brak"
                                  className={`w-full p-2 rounded-lg text-sm border outline-none ${isDark ? 'bg-[#333] border-[#444]' : 'bg-gray-50 border-gray-200'}`}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5 dark:border-white/5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={habit.allowGracePeriod || false}
                                  onChange={(e) => updateHabit(habit.id, { allowGracePeriod: e.target.checked })}
                                  className="w-4 h-4 rounded accent-[#0078D4]"
                                />
                                <span className="text-xs opacity-70">Pozwól przerwać serię 1×/2 tyg. bez resetu</span>
                              </label>
                              <div className="text-xs opacity-50">
                                <span className="font-mono">{completedDays}/{totalDays}</span> = <span className="font-bold">{ratio}%</span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteHabit(habit.id)}
                            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- LEFT PANEL: LIST OF TASKS --- */}
        <div className={`
          flex flex-col border-r w-full md:w-[350px] lg:w-[400px] absolute md:relative inset-0 z-10 transition-transform duration-300
          ${isMobileDetailView ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}
          ${sidebarClasses}
          ${activeTab === 'habits' ? 'hidden' : ''}
        `}>
          
          {/* Mobile Tabs */}
          <div className="flex p-3 gap-2 border-b md:hidden border-opacity-10 dark:border-opacity-10 flex-shrink-0">
            <button 
              onClick={() => setActiveTab('today')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg text-center transition-colors ${activeTab === 'today' ? 'bg-[#0078D4] text-white' : buttonSubtleClasses}`}
            >
              Dzisiaj
            </button>
            <button 
              onClick={() => setActiveTab('tomorrow')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg text-center transition-colors ${activeTab === 'tomorrow' ? 'bg-[#0078D4] text-white' : buttonSubtleClasses}`}
            >
              Jutro
            </button>
            <button 
              onClick={() => setActiveTab('habits')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg text-center transition-colors ${activeTab === 'habits' ? 'bg-[#0078D4] text-white' : buttonSubtleClasses}`}
            >
              Nawyki
            </button>
          </div>

          <div className={`flex flex-col flex-shrink-0 border-b border-black/5 dark:border-white/5 ${settings.timeTrackingEnabled ? 'p-4 md:p-5 pb-2 md:pb-3 gap-1' : 'p-4 md:p-5 pb-3 md:pb-4'}`}>
            <h1 className="text-2xl font-semibold tracking-tight hidden md:block">
              {activeTab === 'today' ? 'Dzisiaj' : 'Jutro'}
            </h1>
            {settings.timeTrackingEnabled && (
              <div className="text-sm font-semibold text-[#0078D4] flex items-center gap-1.5 pt-1">
                <Play size={14} /> Dzisiejszy czas: {totalTodayMinutes} min
              </div>
            )}
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="text-center text-sm opacity-50 mt-10">
                Brak zadań w tej dacie.
              </div>
            ) : (
              filteredTasks.map((task, idx) => {
                const cat = categories.find(c => c.id === task.categoryId);
                const completedSubtasks = task.subtasks.filter(s => s.completed).length;
                const totalSubtasks = task.subtasks.length;
                
                const hasMetaInfo = (task.durationMs > 0 || task.isRunning) || cat || totalSubtasks > 0;
                
                return (
                  <div 
                    key={task.id}
                    className={`group relative flex ${!hasMetaInfo && !task.description ? 'items-center' : 'items-start'} p-3 rounded-xl border transition-all cursor-pointer shadow-sm
                      ${selectedTaskId === task.id ? activeCardClasses : cardClasses}
                      ${task.completed ? 'opacity-50' : ''}
                    `}
                    onClick={() => handleSelectTask(task.id)}
                  >
                    {/* Checkbox */}
                    <button 
                      className={`mr-3 ${!hasMetaInfo && !task.description ? '' : 'mt-0.5'} p-1 rounded-md transition-colors flex-shrink-0 ${task.completed ? 'text-[#0078D4]' : isDark ? 'text-gray-400 hover:bg-[#3D3D3D]' : 'text-gray-400 hover:bg-gray-200'}`}
                      onClick={(e) => toggleTaskComplete(task, e)}
                    >
                      {task.completed ? <CheckSquare size={22} /> : <Square size={22} />}
                    </button>
                    
                    <div className="flex-1 min-w-0 pr-6">
                      <p className={`text-[15px] font-medium leading-snug break-words ${task.completed ? 'line-through text-gray-500' : ''}`}>
                        {task.title}
                      </p>

                      {task.subtasks.length > 0 && (
                        <div className="mt-1.5 mb-1.5 flex flex-col gap-1 overflow-hidden">
                          {task.subtasks.map(sub => (
                            <div 
                              key={sub.id} 
                              className={`flex items-start gap-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-md p-1 -ml-1 transition-colors ${sub.completed ? 'opacity-50' : ''}`}
                              onClick={(e) => {
                                 e.stopPropagation();
                                 toggleSubtaskComplete(task.id, sub.id);
                              }}
                            >
                              <button className={`mt-0.5 p-0 flex-shrink-0 ${sub.completed ? 'text-[#0078D4]' : isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {sub.completed ? <CheckSquare size={14} /> : <Square size={14} />}
                              </button>
                              <span className={`text-[12px] leading-tight break-words flex-1 ${sub.completed ? 'line-through' : ''}`}>{sub.title}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {task.description && (
                         <div 
                           className="text-[12px] opacity-60 line-clamp-2 mt-1 font-normal break-words prose prose-sm dark:prose-invert max-w-none"
                           dangerouslySetInnerHTML={parseMarkdown(task.description)}
                         />
                      )}
                      
                      {hasMetaInfo && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                          {(task.durationMs > 0 || task.isRunning) && (
                            <span className={`text-[11px] font-mono flex items-center gap-1 ${task.isRunning ? 'text-red-500 font-bold' : 'opacity-60'}`}>
                              {task.isRunning ? <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div> : <Play size={10} />}
                              {((task.durationMs + (task.isRunning ? currentTime.getTime() - task.startTime : 0)) / 60000).toFixed(0)}m
                            </span>
                          )}

                          {cat && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border uppercase font-semibold tracking-wider" style={{ borderColor: cat.color, color: cat.color, backgroundColor: 'transparent' }}>
                              {cat.name}
                            </span>
                          )}


                          {totalSubtasks > 0 && (
                            <span className={`text-[11px] flex items-center gap-1 ${completedSubtasks === totalSubtasks ? 'text-green-600 dark:text-green-400 font-medium' : 'opacity-60'}`}>
                              <ListTodo size={12} /> {completedSubtasks}/{totalSubtasks}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col ml-1 absolute right-2 top-1/2 -translate-y-1/2 bg-inherit md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => moveTask(task.id, 'up', e)} disabled={idx === 0} className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded disabled:opacity-20 text-gray-400">
                        <ChevronUp size={18} />
                      </button>
                      <button onClick={(e) => moveTask(task.id, 'down', e)} disabled={idx === filteredTasks.length - 1} className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded disabled:opacity-20 text-gray-400">
                        <ChevronDown size={18} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* ADD TASK INPUT */}
          <div className={`p-4 border-t flex-shrink-0 ${isDark ? 'border-[#3D3D3D]' : 'border-gray-200'}`}>
            <form onSubmit={addTask} className="relative flex items-center">
              <input 
                type="text" 
                placeholder="Dodaj nowe zadanie..."
                className={`w-full py-3 pl-4 pr-12 text-[16px] rounded-xl outline-none transition-all border shadow-sm
                  ${isDark ? 'bg-[#333] border-[#444] focus:border-[#0078D4]' : 'bg-white border-gray-300 focus:border-[#0078D4]'}
                `}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <button 
                type="submit"
                className={`absolute right-2 p-2 rounded-lg ${buttonPrimaryClasses}`}
                disabled={!newTaskTitle.trim()}
              >
                <Plus size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* --- RIGHT PANEL: TASK DETAILS --- */}
        <div className={`
          flex-1 h-full overflow-y-auto absolute md:relative inset-0 bg-inherit transition-transform duration-300 z-10
          ${isMobileDetailView ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          ${activeTab === 'habits' ? 'hidden' : ''}
        `}>
          {selectedTask ? (
            <div className="max-w-3xl mx-auto p-5 md:p-8 pb-32">
              
              {/* Header Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                
                {/* Title Editable (Textarea for auto-wrap) */}
                <textarea 
                  className={`flex-1 w-full text-2xl md:text-3xl font-bold bg-transparent outline-none border-b-2 border-transparent focus:border-[#0078D4] transition-colors resize-none overflow-hidden`}
                  value={selectedTask.title}
                  onChange={(e) => {
                     updateTask(selectedTask.id, { title: e.target.value });
                     // Auto-resize textarea height
                     e.target.style.height = 'auto';
                     e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onFocus={(e) => {
                     e.target.style.height = 'auto';
                     e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  rows={1}
                  placeholder="Tytuł zadania"
                  style={{ minHeight: '40px' }}
                />

                <div className="flex items-center gap-2 self-end sm:self-start flex-shrink-0 mt-2 sm:mt-0">
                  <button 
                    className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${selectedTask.completed ? 'bg-[#0078D4] text-white border-[#0078D4]' : isDark ? 'border-gray-600 hover:bg-[#333]' : 'border-gray-300 hover:bg-gray-100 bg-white'}`}
                    onClick={() => toggleTaskComplete(selectedTask)}
                  >
                    <Check size={20} /> <span className="text-sm font-medium">{selectedTask.completed ? 'Ukończone' : 'Zakończ'}</span>
                  </button>
                  <button 
                    className={`p-2.5 rounded-xl border text-red-500 hover:bg-red-500/10 transition-colors ${isDark ? 'border-[#3D3D3D]' : 'border-gray-200 bg-white'}`}
                    onClick={() => deleteTask(selectedTask.id)}
                    title="Usuń zadanie"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              {/* Time Tracking Big Button */}
              {settings.timeTrackingEnabled && !selectedTask.completed && (
                <div className="mb-8">
                  <button 
                    className={`w-full py-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2
                      ${selectedTask.isRunning 
                        ? 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20 shadow-inner' 
                        : isDark ? 'border-[#444] bg-[#333] hover:bg-[#3D3D3D]' : 'border-gray-300 bg-white hover:bg-gray-50 shadow-sm'}
                    `}
                    onClick={() => toggleTimer(selectedTask)}
                  >
                    <div className="flex items-center gap-3">
                      {selectedTask.isRunning ? <StopCircle size={28} /> : <Play size={28} />}
                      <span className="text-lg font-semibold tracking-wide">
                         {selectedTask.isRunning ? 'ZATRZYMAJ ODLICZANIE' : 'ROZPOCZNIJ ZADANIE'}
                      </span>
                    </div>
                    {/* Live Timer Display */}
                    {(selectedTask.durationMs > 0 || selectedTask.isRunning) && (
                      <span className="text-sm font-mono opacity-80 mt-1 flex items-center gap-2">
                         Czas pracy: {((selectedTask.durationMs + (selectedTask.isRunning ? currentTime.getTime() - selectedTask.startTime : 0)) / 60000).toFixed(1)} min
                      </span>
                    )}
                  </button>
                  
                  <div className="mt-4 flex items-center justify-center gap-3">
                      <span className="text-xs opacity-60 font-medium uppercase tracking-wider">Edytuj czas (minuty):</span>
                      <input 
                         type="number"
                         min="0"
                         className={`w-24 p-1.5 text-center text-[16px] rounded-lg border outline-none font-mono transition-colors ${isDark ? 'bg-[#333] border-[#444] focus:border-[#0078D4]' : 'bg-white border-gray-300 focus:border-[#0078D4]'}`}
                         onBlur={(e) => {
                            if (e.target.value === '') return;
                            const minVal = parseFloat(e.target.value);
                            if (!isNaN(minVal) && minVal >= 0) {
                               updateTask(selectedTask.id, { durationMs: minVal * 60000 });
                            }
                            e.target.value = '';
                         }}
                         placeholder={ (selectedTask.durationMs / 60000).toFixed(1) }
                      />
                  </div>
                </div>
              )}

              {/* Meta Settings (Category) */}
              <div className={`p-4 rounded-2xl border mb-8 flex flex-col sm:flex-row sm:items-center gap-4 ${isDark ? 'bg-[#2D2D2D] border-[#3D3D3D]' : 'bg-white border-gray-100 shadow-sm'}`}>
                <div className="flex-1">
                  <label className="text-xs uppercase font-semibold opacity-60 flex items-center gap-1.5 mb-1.5">
                    <Tag size={14} /> Kategoria
                  </label>
                  <select 
                    className={`w-full p-2.5 rounded-xl text-[16px] font-medium bg-transparent outline-none border transition-colors cursor-pointer ${isDark ? 'border-[#444] focus:border-[#0078D4]' : 'border-gray-200 focus:border-[#0078D4]'}`}
                    value={selectedTask.categoryId || ''}
                    onChange={(e) => updateTask(selectedTask.id, { categoryId: e.target.value })}
                  >
                    <option value="" className={isDark ? "bg-[#2D2D2D]" : "bg-white"}>Wybierz kategorię</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id} className={isDark ? "bg-[#2D2D2D]" : "bg-white"}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subtasks */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold opacity-70 mb-4 flex items-center gap-2 uppercase tracking-wider">
                  <ListTodo size={18} /> Podzadania ({selectedTask.subtasks.filter(s=>s.completed).length}/{selectedTask.subtasks.length})
                </h3>
                <div className={`rounded-2xl border overflow-hidden flex flex-col ${isDark ? 'border-[#3D3D3D] bg-[#2D2D2D]' : 'border-gray-200 bg-white shadow-sm'}`}>
                  <div className="max-h-[30vh] overflow-y-auto w-full">
                    {selectedTask.subtasks.map(sub => (
                      <div key={sub.id} className={`flex items-start gap-3 group p-3 border-b last:border-0 ${isDark ? 'border-[#3D3D3D]' : 'border-gray-100'} ${sub.completed ? 'opacity-60 bg-black/5 dark:bg-white/5' : ''}`}>
                        <button onClick={() => toggleSubtaskComplete(selectedTask.id, sub.id)} className="p-1 mt-0.5 flex-shrink-0">
                          {sub.completed ? <CheckSquare size={20} className="text-[#0078D4]" /> : <Square size={20} className="text-gray-400" />}
                        </button>
                        <span className={`text-[15px] flex-1 break-words leading-relaxed ${sub.completed ? 'line-through text-gray-500' : ''}`}>{sub.title}</span>
                        <button 
                          className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors mt-0.5 flex-shrink-0"
                          onClick={() => deleteSubtask(selectedTask.id, sub.id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Add subtask */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.target.elements.subtask;
                      addSubtask(selectedTask.id, input.value);
                      input.value = '';
                    }}
                    className={`flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5`}
                  >
                    <Plus size={20} className="text-gray-400 ml-1" />
                    <input 
                      name="subtask"
                      type="text" 
                      placeholder="Dodaj nowe podzadanie..." 
                      className={`flex-1 text-[16px] bg-transparent outline-none placeholder-gray-400`}
                    />
                  </form>
                </div>
              </div>

              {/* Markdown Description */}
              <div>
                <h3 className="text-sm font-semibold opacity-70 mb-4 flex items-center gap-2 uppercase tracking-wider">
                  <AlignLeft size={18} /> Notatki do zadania
                </h3>
                
                <div className={`rounded-2xl border p-1 ${isDark ? 'bg-[#2D2D2D] border-[#3D3D3D]' : 'bg-white border-gray-200 shadow-sm'} focus-within:border-[#0078D4] focus-within:ring-1 focus-within:ring-[#0078D4] transition-all`}>
                  <textarea 
                    className={`w-full min-h-[150px] bg-transparent outline-none resize-y text-[16px] p-3 rounded-xl`}
                    placeholder="Wpisz opcjonalny opis. Możesz używać składni Markdown (np. **pogrubienie**, - lista)."
                    value={selectedTask.description}
                    onChange={(e) => updateTask(selectedTask.id, { description: e.target.value })}
                  />
                </div>

              </div>

            </div>
          ) : (
            <div className="hidden md:flex h-full items-center justify-center opacity-30 flex-col">
              <CheckSquare size={64} className="mb-4" />
              <p className="text-lg font-medium">Wybierz zadanie z listy po lewej</p>
            </div>
          )}
        </div>

      </div>

      {/* --- SETTINGS MODAL --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl shadow-2xl ${isDark ? 'bg-[#202020] border border-[#3D3D3D]' : 'bg-white border border-gray-200'}`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Ustawienia</h2>
              <button onClick={() => setIsSettingsOpen(false)} className={`p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors`}><X size={20} /></button>
            </div>

            <div className="space-y-8">
               {/* Theme */}
               <div>
                <div className="font-semibold text-sm mb-2 opacity-80 uppercase tracking-wider">Wygląd aplikacji</div>
                <select 
                  className={`w-full p-3 rounded-xl text-sm border outline-none ${isDark ? 'bg-[#2D2D2D] border-[#444]' : 'bg-gray-50 border-gray-200'}`}
                  value={settings.themeMode}
                  onChange={(e) => setSettings({ ...settings, themeMode: e.target.value })}
                >
                  <option value="auto">Automatycznie (Zależnie od godziny)</option>
                  <option value="light">Tryb Jasny</option>
                  <option value="dark">Tryb Ciemny</option>
                </select>
              </div>

              {/* Toggle Time Tracking */}
              <div className="flex items-center justify-between border-t pt-6 border-black/10 dark:border-white/10">
                 <div>
                  <div className="font-semibold text-sm">Śledzenie czasu (Stoper)</div>
                  <div className="text-xs opacity-60 mt-1">Pokaż duży przycisk "Rozpocznij"</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settings.timeTrackingEnabled}
                    onChange={(e) => setSettings({ ...settings, timeTrackingEnabled: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0078D4]"></div>
                </label>
              </div>

              {/* Categories Manger */}
              <div className="border-t pt-6 border-black/10 dark:border-white/10">
                <div className="font-semibold text-sm mb-3">Zarządzanie Kategoriami</div>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {categories.map(cat => (
                    <div key={cat.id} className={`flex items-center gap-2 p-2 rounded-xl border ${isDark ? 'border-[#3D3D3D] bg-[#2D2D2D]' : 'border-gray-200 bg-white'}`}>
                      <input 
                        type="color" 
                        value={cat.color} 
                        onChange={(e) => setCategories(categories.map(c => c.id === cat.id ? { ...c, color: e.target.value } : c))}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <input 
                        type="text" 
                        value={cat.name}
                        onChange={(e) => setCategories(categories.map(c => c.id === cat.id ? { ...c, name: e.target.value } : c))}
                        className="flex-1 bg-transparent text-sm outline-none font-medium"
                      />
                      <button 
                        onClick={() => setCategories(categories.filter(c => c.id !== cat.id))}
                        className="text-gray-400 hover:text-red-500 p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setCategories([...categories, { id: 'cat_' + Date.now(), name: 'Nowa', color: '#888888' }])}
                  className="mt-3 w-full py-2 border border-dashed rounded-xl text-sm font-semibold opacity-70 hover:opacity-100 flex items-center justify-center gap-2 transition-opacity"
                >
                  <Plus size={16} /> Dodaj kategorię
                </button>
              </div>

              {/* Export */}
              <div className="border-t pt-6 border-black/10 dark:border-white/10">
                <button 
                  onClick={exportCSV}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${buttonPrimaryClasses}`}
                >
                  <Download size={18} /> Pobierz raport pracy (CSV)
                </button>
                <div className="text-center text-xs opacity-50 mt-2">
                  Eksportuje wszystkie zadania i zliczony czas
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* --- POPUP O PRZERWIE (90 MIN) --- */}
      {showBreakPopup && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in zoom-in duration-300">
           <div className={`w-full max-w-sm p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center ${isDark ? 'bg-[#202020] border border-[#3D3D3D]' : 'bg-white border border-gray-200'}`}>
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-5">
                 <Settings size={32} className="animate-spin-slow" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Rozważ przerwę!</h2>
              <p className="text-[15px] opacity-70 mb-8 leading-relaxed">
                 Pracujesz już nieprzerwanie od ponad półtorej godziny. Odpocznij przez chwilę, napij się wody lub przejdź, aby zregenerować umysł!
              </p>
              <button 
                onClick={() => setShowBreakPopup(false)}
                className={`w-full py-3.5 rounded-xl text-base font-bold text-white transition-all transform hover:scale-[1.02] active:scale-95 ${isDark ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-[#0078D4] hover:bg-[#006CBE]'}`}
              >
                 Dzięki za przypomnienie!
              </button>
           </div>
         </div>
      )}

    </div>
  );
}