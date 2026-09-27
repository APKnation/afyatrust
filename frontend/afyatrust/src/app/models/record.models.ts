export interface MedicalRecordInput {
  health_id: string;
  facility_id: string;
  facility_name: string;
  record_type: string;
  record_data: any;
  metadata_uri?: string;
}

export interface AuditEvent {
  accessor: string;
  role: string;
  action: string;
  timestamp: number;
  facility: string;
}