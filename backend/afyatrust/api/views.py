from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.utils import timezone
from .models import Patient, MedicalRecord, AccessRequest
from .blockchain import contract, w3, send_transaction
import hashlib, json

# ============ USAJILI ============

@api_view(['POST'])
def register_patient(request):
    """Hospitali inasajili mgonjwa mpya"""
    data = request.data
    
    # 1. Save kwenye database
    patient = Patient.objects.create(
        health_id=data['health_id'],
        wallet_address=data['wallet_address'],
        full_name=data['full_name'],
        phone=data.get('phone', '')
    )
    
    # 2. Rekodi kwenye blockchain
    tx = contract.functions.registerPatient(
        data['health_id'],
        data['wallet_address'],
        data['full_name']
    )
    tx_hash = send_transaction(tx)
    
    return Response({
        "status": "success",
        "health_id": patient.health_id,
        "tx_hash": tx_hash
    })

# ============ MGONJWA ANAONA DATA YAKE ============

@api_view(['GET'])
def my_records(request):
    wallet = request.headers.get('X-Wallet-Address')
    patient = Patient.objects.filter(wallet_address=wallet).first()
    
    if not patient:
        return Response({"error": "Wewe si mgonjwa aliyesajiliwa"}, status=404)
    
    records = MedicalRecord.objects.filter(patient=patient)
    
    # Pata audit trail kutoka blockchain
    try:
        audit = contract.functions.getMyAuditTrail().call({'from': wallet})
        audit_list = [{
            "accessor": a[1],
            "role": a[2],
            "action": a[4],
            "timestamp": a[5],
            "facility": a[3]
        } for a in audit]
    except Exception as e:
        audit_list = []
    
    return Response({
        "health_id": patient.health_id,
        "full_name": patient.full_name,
        "records": [{
            "id": r.id,
            "facility": r.facility_name,
            "type": r.record_type,
            "data": r.record_data,
            "hash": r.record_hash,
            "date": r.created_at,
            "verified": True
        } for r in records],
        "audit_trail": audit_list
    })

# ============ MGONJWA ANATO RUHUSA ============

@api_view(['POST'])
def patient_grant_access(request):
    wallet = request.headers.get('X-Wallet-Address')
    patient = Patient.objects.filter(wallet_address=wallet).first()
    
    if not patient:
        return Response({"error": "Wewe si mgonjwa"}, status=403)
    
    data = request.data
    
    # Andika kwenye blockchain
    tx = contract.functions.patientGrantAccess(
        patient.health_id,
        data['doctor_wallet'],
        data.get('days', 7)
    )
    tx_hash = send_transaction(tx)
    
    return Response({
        "status": "success",
        "message": f"Ruhusa imetolewa kwa siku {data.get('days', 7)}",
        "tx_hash": tx_hash
    })

@api_view(['POST'])
def patient_revoke_access(request):
    wallet = request.headers.get('X-Wallet-Address')
    patient = Patient.objects.filter(wallet_address=wallet).first()
    
    tx = contract.functions.patientRevokeAccess(
        patient.health_id,
        request.data['doctor_wallet']
    )
    tx_hash = send_transaction(tx)
    
    return Response({"status": "success", "tx_hash": tx_hash})

# ============ DAKTARI ANAOMBA RUHUSA ============

@api_view(['POST'])
def doctor_request_access(request):
    data = request.data
    patient = Patient.objects.get(health_id=data['health_id'])
    
    access_request = AccessRequest.objects.create(
        patient=patient,
        doctor_wallet=data['doctor_wallet'],
        doctor_name=data['doctor_name'],
        facility_id=data['facility_id'],
        reason=data['reason']
    )
    
    return Response({
        "status": "pending",
        "request_id": access_request.id,
        "message": "Ombi limetumwa kwa mgonjwa"
    })

@api_view(['GET'])
def pending_requests(request):
    wallet = request.headers.get('X-Wallet-Address')
    patient = Patient.objects.filter(wallet_address=wallet).first()
    
    requests = AccessRequest.objects.filter(patient=patient, status='PENDING')
    
    return Response([{
        "id": r.id,
        "doctor_name": r.doctor_name,
        "doctor_wallet": r.doctor_wallet,
        "facility_id": r.facility_id,
        "reason": r.reason,
        "created_at": r.created_at
    } for r in requests])

@api_view(['POST'])
def approve_request(request, request_id):
    wallet = request.headers.get('X-Wallet-Address')
    patient = Patient.objects.filter(wallet_address=wallet).first()
    access_request = AccessRequest.objects.get(id=request_id, patient=patient)
    
    # Toa ruhusa kwenye blockchain
    tx = contract.functions.patientGrantAccess(
        patient.health_id,
        access_request.doctor_wallet,
        7  # siku 7
    )
    tx_hash = send_transaction(tx)
    
    access_request.status = 'APPROVED'
    access_request.tx_hash = tx_hash
    access_request.responded_at = timezone.now()
    access_request.save()
    
    return Response({"status": "approved", "tx_hash": tx_hash})

@api_view(['POST'])
def reject_request(request, request_id):
    wallet = request.headers.get('X-Wallet-Address')
    patient = Patient.objects.filter(wallet_address=wallet).first()
    access_request = AccessRequest.objects.get(id=request_id, patient=patient)
    
    access_request.status = 'REJECTED'
    access_request.responded_at = timezone.now()
    access_request.save()
    
    return Response({"status": "rejected"})

# ============ DAKTARI ANAONA DATA ============

@api_view(['GET'])
def doctor_view_record(request, health_id):
    wallet = request.headers.get('X-Wallet-Address')
    facility_id = request.headers.get('X-Facility-ID', 'UNKNOWN')
    
    # Cheki blockchain
    has_access = contract.functions.hasAccess(health_id, wallet).call()
    
    if not has_access:
        return Response({
            "error": "Huna ruhusa",
            "action": "OMBA_RUHUSA"
        }, status=403)
    
    # Rekodi view
    tx = contract.functions.recordView(health_id, facility_id)
    send_transaction(tx)
    
    patient = Patient.objects.get(health_id=health_id)
    records = MedicalRecord.objects.filter(patient=patient)
    
    return Response({
        "health_id": health_id,
        "full_name": patient.full_name,
        "records": [{
            "facility": r.facility_name,
            "type": r.record_type,
            "data": r.record_data,
            "verified": True,
            "date": r.created_at
        } for r in records]
    })

# ============ BREAK-GLASS ============

@api_view(['POST'])
def break_glass(request):
    wallet = request.headers.get('X-Wallet-Address')
    data = request.data
    
    tx = contract.functions.breakGlass(
        data['health_id'],
        data['facility_id'],
        data['reason']
    )
    tx_hash = send_transaction(tx)
    
    return Response({
        "status": "success",
        "message": "Break-glass imetumika",
        "tx_hash": tx_hash
    })

# ============ ONGEZA RECORD ============

@api_view(['POST'])
def add_record(request):
    data = request.data
    patient = Patient.objects.get(health_id=data['health_id'])
    
    # Tengeneza hash
    record_str = json.dumps(data['record_data'], sort_keys=True)
    record_hash = "0x" + hashlib.sha256(record_str.encode()).hexdigest()
    
    # Save off-chain
    record = MedicalRecord.objects.create(
        patient=patient,
        facility_id=data['facility_id'],
        facility_name=data['facility_name'],
        record_type=data['record_type'],
        record_data=data['record_data'],
        record_hash=record_hash
    )
    
    # Save on-chain (hash tu)
    tx = contract.functions.addRecord(
        data['health_id'],
        record_hash,
        data['facility_id'],
        data.get('metadata_uri', '')
    )
    tx_hash = send_transaction(tx)
    record.tx_hash = tx_hash
    record.save()
    
    return Response({
        "status": "success",
        "record_id": record.id,
        "hash": record_hash,
        "tx_hash": tx_hash
    })