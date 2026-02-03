-- Educational modules library (created by clinicians)
CREATE TABLE IF NOT EXISTS education_modules (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category VARCHAR(100),
  estimated_duration_minutes INTEGER,
  image_url TEXT,
  video_url TEXT,
  created_by INTEGER REFERENCES patients(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Educational modules assigned to patients
CREATE TABLE IF NOT EXISTS patient_education_modules (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES education_modules(id) ON DELETE CASCADE,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(patient_id, module_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_education_modules_category ON education_modules(category);
CREATE INDEX IF NOT EXISTS idx_patient_education_modules_patient ON patient_education_modules(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_education_modules_module ON patient_education_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_patient_education_modules_viewed ON patient_education_modules(viewed);
