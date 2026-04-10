import { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, FlaskConical, ChevronDown, ChevronUp, Clock, Lightbulb, Check, Loader2, X } from 'lucide-react';
import { apiFetch } from '../../utils/scribe-api';
import type { PromptVersion, SoapTemplate } from '../../types';

const PROMPT_TIPS = [
  'Keep each section to 2-3 bullet points maximum.',
  'Write in flowing narrative paragraphs, not bullet points.',
  'Use mixed formatting: narrative for Subjective/Assessment, bullets for Objective/Plan.',
  'Always use ICF framework terminology.',
  'Include direct patient quotes where clinically relevant.',
  'Focus on functional outcomes and patient goals.',
  'Include specific exercise parameters (sets, reps, load, tempo).',
  'Note any red flags or precautions discussed.',
  'Use plain language suitable for patient-shared notes.',
  'Include compliance/adherence observations for home exercise program.',
  'Document pain ratings using numeric scale (e.g., 4/10).',
  'Include outcome measure scores and changes from baseline.',
  'Mention psychosocial factors that may impact recovery.',
  'Note any referrals or onward management discussed.',
];

export default function ScribeSettingsPage() {
  const [prompt, setPrompt] = useState('');
  const [savedPrompt, setSavedPrompt] = useState('');
  const [discipline, setDiscipline] = useState('exercise_physiology');
  const [isDefault, setIsDefault] = useState(true);
  const [templates, setTemplates] = useState<SoapTemplate[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [showTips, setShowTips] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showTestResult, setShowTestResult] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [testTranscript, setTestTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = prompt !== savedPrompt;

  useEffect(() => {
    async function load() {
      try {
        const [prefRes, templatesRes, versionsRes] = await Promise.all([
          apiFetch('/preferences'),
          apiFetch('/preferences/templates'),
          apiFetch('/preferences/versions'),
        ]);
        if (prefRes.ok) {
          const data = await prefRes.json();
          setPrompt(data.systemPrompt);
          setSavedPrompt(data.systemPrompt);
          setDiscipline(data.discipline);
          setIsDefault(data.isDefault);
        }
        if (templatesRes.ok) setTemplates(await templatesRes.json());
        if (versionsRes.ok) setVersions(await versionsRes.json());
      } catch (err) {
        console.error('Settings load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/preferences', {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: prompt, discipline }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        return;
      }
      setSavedPrompt(prompt);
      setIsDefault(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      const versionsRes = await apiFetch('/preferences/versions');
      if (versionsRes.ok) setVersions(await versionsRes.json());
    } catch {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setError('');
    setShowTestResult(false);
    try {
      const res = await apiFetch('/preferences/test', {
        method: 'POST',
        body: JSON.stringify({ systemPrompt: prompt }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to test prompt');
        return;
      }
      const data = await res.json();
      setTestResult(data.content);
      setTestTranscript(data.transcript);
      setShowTestResult(true);
    } catch {
      setError('Failed to test prompt');
    } finally {
      setTesting(false);
    }
  }

  function handleResetToDefault() {
    const defaultTemplate = templates.find(t => t.isDefault);
    if (defaultTemplate) setPrompt(defaultTemplate.systemPrompt);
  }

  function handleSelectTemplate(templateId: string) {
    const template = templates.find(t => t.id === Number(templateId));
    if (template) {
      if (isDirty && !confirm('You have unsaved changes. Load this template?')) return;
      setPrompt(template.systemPrompt);
      setDiscipline(template.discipline);
    }
  }

  async function handleRestoreVersion(versionId: number) {
    try {
      const res = await apiFetch(`/preferences/versions/${versionId}`);
      if (res.ok) {
        const data = await res.json();
        if (isDirty && !confirm('You have unsaved changes. Restore this version?')) return;
        setPrompt(data.systemPrompt);
        if (data.discipline) setDiscipline(data.discipline);
      }
    } catch {
      setError('Failed to load version');
    }
  }

  function appendTip(tip: string) {
    setPrompt(prev => prev.trimEnd() + '\n\n' + tip);
    textareaRef.current?.focus();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <h1 className="text-xl sm:text-2xl font-display font-bold text-secondary-700 mb-1">SOAP Note Settings</h1>
      <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6">Customise how the AI generates your clinical notes</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 flex items-center justify-between">
          <span className="mr-2">{error}</span>
          <button onClick={() => setError('')} className="shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-secondary-700 mb-1.5">Start from a template</label>
        <select
          className="w-full sm:w-72 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none"
          onChange={(e) => handleSelectTemplate(e.target.value)}
          value=""
        >
          <option value="" disabled>Select a template...</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {isDefault && <p className="text-xs text-gray-400 mt-1">Using the default template — customise it below</p>}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-secondary-700">System prompt</label>
          <span className={`text-xs ${prompt.length > 4500 ? 'text-red-500' : 'text-gray-400'}`}>{prompt.length} / 5,000</span>
        </div>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono leading-relaxed bg-white focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none resize-y min-h-[250px] sm:min-h-[350px]"
          placeholder="Enter your system prompt for SOAP note generation..."
          maxLength={5000}
        />
        <p className="text-xs text-gray-400 mt-1">This prompt tells the AI how to format and structure your SOAP notes.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-sm font-semibold transition active:scale-[0.98] ${
            saved ? 'bg-green-500 text-white' : isDirty ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button onClick={handleTest} disabled={testing || prompt.trim().length < 10} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-2 border-primary-300 bg-primary-50 rounded-lg text-sm font-semibold text-primary-700 hover:bg-primary-100 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          {testing ? 'Generating...' : 'Test prompt'}
        </button>
        <button onClick={handleResetToDefault} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm text-gray-600 hover:text-secondary-700 hover:bg-gray-100 rounded-lg transition active:scale-[0.98]">
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>

      {showTestResult && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-secondary-700">Test Result — Sample SOAP Note</h3>
            <button onClick={() => setShowTestResult(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 sm:p-5">
            <pre className="text-sm text-secondary-700 whitespace-pre-wrap leading-relaxed">{testResult}</pre>
          </div>
          <details className="border-t border-gray-100">
            <summary className="px-4 sm:px-5 py-2.5 text-xs text-gray-500 cursor-pointer hover:text-gray-700">View test transcript used</summary>
            <pre className="px-4 sm:px-5 pb-4 text-xs text-gray-500 whitespace-pre-wrap">{testTranscript}</pre>
          </details>
        </div>
      )}

      <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button onClick={() => setShowTips(!showTips)} className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-gray-50 transition">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-secondary-700">Prompt tips</span>
            <span className="text-xs text-gray-400 hidden sm:inline">— click to add to your prompt</span>
          </div>
          {showTips ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showTips && (
          <div className="px-4 sm:px-5 pb-4 grid gap-2">
            {PROMPT_TIPS.map((tip, i) => (
              <button key={i} onClick={() => appendTip(tip)} className="text-left px-3 py-2.5 text-sm text-gray-600 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 rounded-lg transition border border-transparent hover:border-primary-200 active:scale-[0.99]">
                + {tip}
              </button>
            ))}
          </div>
        )}
      </div>

      {versions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowVersions(!showVersions)} className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-gray-50 transition">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-secondary-700">Version history</span>
              <span className="text-xs text-gray-400">({versions.length})</span>
            </div>
            {showVersions ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showVersions && (
            <div className="px-4 sm:px-5 pb-4 space-y-1">
              {versions.map((v) => (
                <button key={v.id} onClick={() => handleRestoreVersion(v.id)} className="w-full text-left flex items-center justify-between px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition active:scale-[0.99]">
                  <span>{formatDate(v.createdAt)}</span>
                  <span className="text-xs text-primary-500 hover:underline">Restore</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
