export interface Patient {
  health_id: string;
  wallet_address: string;
  full_name: string;
  phone?: string;
  created_at?: string;
}

export interface PatientRecord {
  id: number;
  facility: string;
  type: string;
  data: any;
  hash: string;
  date: string;
  verified: boolean;
  tx_hash?: string;
  _source_uri?: string;
}

export interface AuditEvent {
  accessor: string;
  role: string;
  action: string;
  facility?: string;
  timestamp: number;
}

export interface PatientData {
  health_id: string;
  full_name: string;
  records: PatientRecord[];
  audit_trail: AuditEvent[];
}