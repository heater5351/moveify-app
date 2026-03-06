import { ArrowLeft, Mail, Phone, MapPin, Calendar, Stethoscope, UserPen } from 'lucide-react';
import type { Patient } from '../types/index';

type PatientAccountPageProps = {
  patient: Patient;
  onBack: () => void;
  onEditProfile: () => void;
};

export const PatientAccountPage = ({ patient, onBack, onEditProfile }: PatientAccountPageProps) => {
  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 pb-8">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Profile Card */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-400 flex items-center justify-center text-xl font-bold text-white shrink-0">
              {patient.name?.[0]?.toUpperCase() || 'P'}
            </div>
            <div>
              <h2 className="text-lg font-semibold font-display text-secondary-500">{patient.name}</h2>
              <p className="text-xs text-slate-400">Patient</p>
            </div>
          </div>
          <button
            onClick={onEditProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <UserPen size={15} />
            Edit
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail size={15} className="text-slate-400 shrink-0" />
            <span className="text-slate-700">{patient.email}</span>
          </div>
          {patient.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">{patient.phone}</span>
            </div>
          )}
          {patient.address && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">{patient.address}</span>
            </div>
          )}
          {patient.dob && (
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">
                {new Date(patient.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}
          {patient.condition && (
            <div className="flex items-center gap-3 text-sm">
              <Stethoscope size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">{patient.condition}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
