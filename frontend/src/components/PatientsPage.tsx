import { useState } from 'react';
import { Plus, User, Search } from 'lucide-react';
import type { Patient } from '../types/index.ts';

interface PatientsPageProps {
  patients: Patient[];
  onViewPatient: (patient: Patient) => void;
  onAddPatient: () => void;
}

export const PatientsPage = ({ patients, onViewPatient, onAddPatient }: PatientsPageProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter patients based on search query
  const filteredPatients = patients.filter(patient => {
    const query = searchQuery.toLowerCase();
    return (
      patient.name.toLowerCase().includes(query) ||
      patient.email.toLowerCase().includes(query) ||
      patient.phone.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <div className="mb-7">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-semibold font-display text-secondary-500 tracking-tight">Patients</h2>
            <p className="text-sm text-slate-500 mt-0.5">Manage your patients and their assigned programs</p>
          </div>
          <button
            onClick={onAddPatient}
            className="bg-primary-400 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm shadow-sm"
          >
            <Plus size={16} />
            Add Patient
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by name, email, or phone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      {filteredPatients.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl ring-1 ring-slate-200">
          <p className="text-slate-500 text-sm">
            {searchQuery ? `No patients found matching "${searchQuery}"` : 'No patients added yet'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-3 text-primary-500 hover:text-primary-600 font-medium text-sm"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {searchQuery && (
            <p className="text-xs text-slate-500 mb-3">
              {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Directory-style patient list */}
          <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
            {/* Table Header */}
            <div className="border-b border-slate-100 px-6 py-3 grid grid-cols-12 gap-6 text-xs font-semibold text-slate-500 uppercase tracking-wide items-center">
              <div className="col-span-1"></div>
              <div className="col-span-3">Name</div>
              <div className="col-span-1">Age</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Phone</div>
              <div className="col-span-2">Programs</div>
            </div>

            {/* Patient Rows */}
            <div className="divide-y divide-slate-100">
              {filteredPatients.map(patient => (
                <div
                  key={patient.id}
                  onClick={() => onViewPatient(patient)}
                  className="px-6 py-3.5 grid grid-cols-12 gap-6 hover:bg-slate-50 cursor-pointer transition-colors items-center"
                >
                  {/* Avatar */}
                  <div className="col-span-1">
                    <div className="w-9 h-9 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100">
                      <User className="text-primary-400" size={16} />
                    </div>
                  </div>

                  {/* Name */}
                  <div className="col-span-3">
                    <h3 className="font-medium text-slate-900 text-sm">{patient.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{patient.condition}</p>
                  </div>

                  {/* Age */}
                  <div className="col-span-1">
                    <p className="text-sm text-slate-600">{patient.age}y</p>
                  </div>

                  {/* Email */}
                  <div className="col-span-3">
                    <p className="text-sm text-slate-500 truncate">{patient.email}</p>
                  </div>

                  {/* Phone */}
                  <div className="col-span-2">
                    <p className="text-sm text-slate-500">{patient.phone}</p>
                  </div>

                  {/* Programs */}
                  <div className="col-span-2">
                    {patient.assignedPrograms && patient.assignedPrograms.length > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-600 border border-primary-100">
                        {patient.assignedPrograms.length} {patient.assignedPrograms.length === 1 ? 'program' : 'programs'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                        None
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};
