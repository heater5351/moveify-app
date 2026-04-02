import { useState, useEffect, useRef } from 'react';
import { LogOut, ChevronDown, KeyRound, Shield, MapPin, UserPen, Bug } from 'lucide-react';
import type { User, Location } from '../types/index';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

type AccountDropdownProps = {
  user: User;
  onLogout: () => void;
  onEditProfile: () => void;
  onChangePassword: () => void;
  onNavigateAdmin: () => void;
  onReportBug: () => void;
};

export const AccountDropdown = ({ user, onLogout, onEditProfile, onChangePassword, onNavigateAdmin, onReportBug }: AccountDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(user.defaultLocationId || null);
  const [locationName, setLocationName] = useState<string | null>(user.locationName || null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch locations when dropdown opens (clinician only)
  useEffect(() => {
    if (isOpen && user.role === 'clinician' && user.isAdmin) {
      fetch(`${API_URL}/admin/locations`, { headers: getAuthHeaders() })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.locations) setLocations(data.locations);
        })
        .catch(() => {});
    }
  }, [isOpen, user.role, user.isAdmin]);

  const handleLocationChange = async (locationId: number | null) => {
    setSelectedLocationId(locationId);
    try {
      const res = await fetch(`${API_URL}/auth/default-location`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ locationId })
      });
      if (res.ok) {
        const data = await res.json();
        setLocationName(data.locationName);
      }
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-primary-400 flex items-center justify-center text-[11px] font-semibold text-white leading-none">
          {user.name?.[0]?.toUpperCase() || 'C'}
        </div>
        <span className="text-sm text-white/65 font-medium max-w-[120px] truncate">
          {user.name || 'Clinician'}
        </span>
        <ChevronDown size={14} className={`text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 overflow-hidden z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-400 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                {user.name?.[0]?.toUpperCase() || 'C'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-50 text-primary-600">
                Clinician
              </span>
              {user.isAdmin && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600">
                  Admin
                </span>
              )}
            </div>
          </div>

          {/* Location (clinician only) */}
          {user.role === 'clinician' && locations.length > 0 && (
            <div className="px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MapPin size={12} className="text-slate-400" />
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Location</span>
              </div>
              <select
                value={selectedLocationId || ''}
                onChange={(e) => handleLocationChange(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
              >
                <option value="">No location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Location display for non-admin with a location set */}
          {user.role === 'clinician' && !user.isAdmin && locationName && (
            <div className="px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <MapPin size={12} className="text-slate-400" />
                <span className="text-xs text-slate-500">{locationName}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setIsOpen(false); onEditProfile(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <UserPen size={15} className="text-slate-400" />
              Edit Profile
            </button>
            <button
              onClick={() => { setIsOpen(false); onChangePassword(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <KeyRound size={15} className="text-slate-400" />
              Change Password
            </button>

            <button
              onClick={() => { setIsOpen(false); onReportBug(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Bug size={15} className="text-slate-400" />
              Report an Issue
            </button>

            {user.isAdmin && (
              <button
                onClick={() => { setIsOpen(false); onNavigateAdmin(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Shield size={15} className="text-slate-400" />
                Admin Panel
              </button>
            )}
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
