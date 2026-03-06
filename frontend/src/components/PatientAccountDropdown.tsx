import { useState, useEffect, useRef } from 'react';
import { LogOut, ChevronDown, KeyRound, UserCircle } from 'lucide-react';
import type { Patient } from '../types/index';

type PatientAccountDropdownProps = {
  patient: Patient;
  onLogout: () => void;
  onChangePassword: () => void;
  onNavigateAccount: () => void;
};

export const PatientAccountDropdown = ({ patient, onLogout, onChangePassword, onNavigateAccount }: PatientAccountDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-primary-400 flex items-center justify-center text-[11px] font-semibold text-white leading-none">
          {patient.name?.[0]?.toUpperCase() || 'P'}
        </div>
        <span className="text-sm text-white/65 font-medium max-w-[120px] truncate">
          {patient.name}
        </span>
        <ChevronDown size={14} className={`text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 overflow-hidden z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-400 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                {patient.name?.[0]?.toUpperCase() || 'P'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{patient.name}</p>
                <p className="text-xs text-slate-400 truncate">{patient.email}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setIsOpen(false); onNavigateAccount(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <UserCircle size={15} className="text-slate-400" />
              Account
            </button>
            <button
              onClick={() => { setIsOpen(false); onChangePassword(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <KeyRound size={15} className="text-slate-400" />
              Change Password
            </button>
          </div>

          {/* Sign out */}
          <div className="border-t border-slate-100 py-1">
            <button
              onClick={() => { setIsOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
