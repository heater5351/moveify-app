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
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-2">Patient List</h2>
            <p className="text-lg text-gray-600">Manage your patients and their assigned programs</p>
          </div>
          <button
            onClick={onAddPatient}
            className="bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white px-8 py-4 rounded-xl hover:from-moveify-teal-dark hover:to-moveify-ocean font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <Plus size={22} />
            Add Patient
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search patients by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all"
          />
        </div>
      </div>

      {filteredPatients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {searchQuery ? `No patients found matching "${searchQuery}"` : 'No patients added yet'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 text-moveify-teal hover:text-moveify-teal-dark font-medium"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {searchQuery && (
            <p className="text-sm text-gray-600 mb-4">
              Found {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
            </p>
          )}

          {/* Directory-style patient list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 grid grid-cols-12 gap-6 font-semibold text-sm text-gray-700 items-center">
              <div className="col-span-1"></div>
              <div className="col-span-3">Name</div>
              <div className="col-span-1">Age</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Phone</div>
              <div className="col-span-2">Programs</div>
            </div>

            {/* Patient Rows */}
            <div className="divide-y divide-gray-200">
              {filteredPatients.map(patient => (
                <div
                  key={patient.id}
                  onClick={() => onViewPatient(patient)}
                  className="px-6 py-3 grid grid-cols-12 gap-6 hover:bg-primary-50 cursor-pointer transition-colors items-center"
                >
                  {/* Profile Picture */}
                  <div className="col-span-1">
                    <div className="w-10 h-10 bg-gradient-to-br from-moveify-teal to-moveify-ocean rounded-full flex items-center justify-center">
                      <User className="text-white" size={20} />
                    </div>
                  </div>

                  {/* Name */}
                  <div className="col-span-3">
                    <h3 className="font-semibold text-gray-900">{patient.name}</h3>
                  </div>

                  {/* Age */}
                  <div className="col-span-1">
                    <p className="text-sm text-gray-600">{patient.age} years</p>
                  </div>

                  {/* Email */}
                  <div className="col-span-3">
                    <p className="text-sm text-gray-600 truncate">{patient.email}</p>
                  </div>

                  {/* Phone */}
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">{patient.phone}</p>
                  </div>

                  {/* Programs */}
                  <div className="col-span-2">
                    {patient.assignedPrograms && patient.assignedPrograms.length > 0 ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {patient.assignedPrograms.length} {patient.assignedPrograms.length === 1 ? 'Program' : 'Programs'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
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
