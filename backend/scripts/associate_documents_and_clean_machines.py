import os
import shutil
from pathlib import Path
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.core.config import settings
from app.models.machine import Machine, Tool
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, ApprovalRecord, ReviewComment
from app.models.procedure import Procedure, ProcedureStep, ProcedureRun, ProcedureRunStep
from app.models.troubleshooting import (
    TroubleshootingCase,
    TroubleshootingGuide,
    TroubleshootingVersion,
    TroubleshootingNode,
    TroubleshootingEdge,
    TroubleshootingSession,
    TroubleshootingResponse,
    TroubleshootingEvidence,
    TroubleshootingEscalation,
)
from app.models.simulation import (
    SimulationScenario,
    SimulationAttempt,
    SimulationScenarioRevision,
    SimulationScenarioReport,
)
from app.models.audio import AudioReference, AudioAnalysisJob
from app.models.media import MediaAsset, KIND_DOCUMENT
from app.models.embedding import KnowledgeEmbedding
from app.modules.assistant.models import (
    KnowledgeSource,
    KnowledgeChunk,
    ChatMessageSource,
    ChatConversation,
)

ALLOWED_MACHINES = {
    "CT": "4a49fee7-d54b-4898-b653-2e7f8f6d91bc",
    "MRI": "2c615e42-6e10-419c-826d-8835812eca18",
    "XRAY": "e13400d3-faab-48bc-811a-6a30c78a0b76",
    "ECG": "6baa63bc-044a-45fe-afcd-69c67a80f224",
}

DOC_TO_MACHINE = {
    "gfg.pdf": ALLOWED_MACHINES["CT"],
    "mritom.pdf": ALLOWED_MACHINES["MRI"],
    "xray.pdf": ALLOWED_MACHINES["XRAY"],
    "ecg.pdf": ALLOWED_MACHINES["ECG"],
}

DOC_TITLES = {
    "gfg.pdf": "Good Practice Guide CT (Computed Tomography)",
    "mritom.pdf": "MRI Technical Operations Manual",
    "xray.pdf": "X-Ray Equipment Operation & Maintenance Manual",
    "ecg.pdf": "Electrocardiogram (ECG) Technical & Operations Guide",
}

def associate_documents(db: Session):
    print("=" * 70)
    print("STEP 1: ASSOCIATING UPLOADED DOCUMENTS TO 4 MEDICAL MACHINES")
    print("=" * 70)
    
    kb_dir = Path("C:/Users/sonaw/GurukulAI/Knowledge Base")
    media_upload_dir = Path(getattr(settings, "MEDIA_UPLOAD_DIR", "data/media"))
    media_upload_dir.mkdir(parents=True, exist_ok=True)
    
    for filename, machine_id in DOC_TO_MACHINE.items():
        machine = db.get(Machine, machine_id)
        if not machine:
            print(f"Error: Machine {machine_id} not found!")
            continue
            
        print(f"\nProcessing {filename} -> Machine '{machine.name}' ({machine.id})...")
        
        # 1. Update KnowledgeSource in RAG database
        source_ref_id = f"kb:{filename}"
        source = (
            db.query(KnowledgeSource)
            .filter(
                KnowledgeSource.source_type == "knowledge_base_document",
                KnowledgeSource.source_ref_id == source_ref_id,
            )
            .first()
        )
        if not source:
            # Fallback search by title
            source = (
                db.query(KnowledgeSource)
                .filter(
                    KnowledgeSource.source_type == "knowledge_base_document",
                    KnowledgeSource.title.ilike(f"%{filename}%"),
                )
                .first()
            )
            
        if source:
            source.machine_id = machine_id
            print(f"  [OK] Updated KnowledgeSource [{source.id}] machine_id = {machine_id}")
            
            # Update chunks metadata
            chunks = db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).all()
            for chunk in chunks:
                meta = dict(chunk.metadata_json or {})
                meta["machine_id"] = machine_id
                meta["machine_name"] = machine.name
                chunk.metadata_json = meta
            print(f"  [OK] Updated {len(chunks)} chunks with machine metadata")
        else:
            print(f"  ! KnowledgeSource for {filename} not found in DB")
            
        # 2. Ensure MediaAsset exists for this document on the machine
        src_file = kb_dir / filename
        if src_file.exists():
            storage_key = f"documents/{machine_id}/{filename}"
            dest_file = media_upload_dir / storage_key
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            if not dest_file.exists():
                shutil.copy2(src_file, dest_file)
                print(f"  [OK] Copied file to media storage: {dest_file}")
                
            existing_asset = (
                db.query(MediaAsset)
                .filter(
                    MediaAsset.machine_id == machine_id,
                    MediaAsset.original_name == filename,
                )
                .first()
            )
            file_size = src_file.stat().st_size
            doc_title = DOC_TITLES.get(filename, f"{machine.name} Operation Manual ({filename})")
            
            if not existing_asset:
                admin_user = db.query(Machine).first() # let's get a valid user
                from app.models.user import User
                sys_user = db.query(User).first()
                uploader_id = sys_user.id if sys_user else "system"
                
                new_asset = MediaAsset(
                    title=doc_title,
                    description=f"Official verified OEM technical & operations manual for {machine.name}.",
                    tags=f"{machine.name.lower()},manual,sop,documentation,verified",
                    machine_id=machine_id,
                    kind=KIND_DOCUMENT,
                    storage_key=storage_key,
                    original_name=filename,
                    mime="application/pdf",
                    size_bytes=file_size,
                    uploaded_by=uploader_id,
                )
                db.add(new_asset)
                print(f"  [OK] Created MediaAsset document: '{doc_title}'")
            else:
                existing_asset.title = doc_title
                existing_asset.kind = KIND_DOCUMENT
                existing_asset.storage_key = storage_key
                print(f"  [OK] Updated existing MediaAsset: [{existing_asset.id}]")

    db.commit()
    print("\nDocuments association completed successfully.")

def remove_other_machines(db: Session):
    print("\n" + "=" * 70)
    print("STEP 2: REMOVING ALL NON-ALLOWED MACHINES AND ASSOCIATED DATA")
    print("=" * 70)
    
    allowed_ids = set(ALLOWED_MACHINES.values())
    all_machines = db.query(Machine).all()
    
    machines_to_remove = [m for m in all_machines if m.id not in allowed_ids]
    print(f"Found {len(machines_to_remove)} machines to remove (keeping only the 4 medical machines):")
    for m in machines_to_remove:
        print(f"  - [{m.id}] {m.name} ({m.model_number})")
        
    for m in machines_to_remove:
        mid = m.id
        print(f"\nCleaning data for machine [{mid}] ({m.name})...")
        
        # 1. Tools
        tools_deleted = db.query(Tool).filter(Tool.machine_id == mid).delete(synchronize_session=False)
        print(f"  - Deleted {tools_deleted} tools")
        
        # 2. Simulation scenarios and attempts
        sim_scenarios = db.query(SimulationScenario).filter(SimulationScenario.machine_id == mid).all()
        for sim in sim_scenarios:
            attempts = db.query(SimulationAttempt).filter(SimulationAttempt.scenario_id == sim.id).all()
            for att in attempts:
                db.query(SimulationScenarioReport).filter(SimulationScenarioReport.attempt_id == att.id).delete(synchronize_session=False)
                db.delete(att)
            db.query(SimulationScenarioRevision).filter(SimulationScenarioRevision.scenario_id == sim.id).delete(synchronize_session=False)
            db.delete(sim)
        print(f"  - Deleted {len(sim_scenarios)} simulation scenarios and child records")
        
        # 3. Troubleshooting cases and sessions
        tb_cases = db.query(TroubleshootingCase).filter(TroubleshootingCase.machine_id == mid).all()
        for tc in tb_cases:
            db.delete(tc)
        print(f"  - Deleted {len(tb_cases)} troubleshooting cases")
        
        tb_guides = db.query(TroubleshootingGuide).filter(TroubleshootingGuide.machine_id == mid).all()
        for tg in tb_guides:
            versions = db.query(TroubleshootingVersion).filter(TroubleshootingVersion.guide_id == tg.id).all()
            for tv in versions:
                db.query(TroubleshootingEdge).filter(TroubleshootingEdge.version_id == tv.id).delete(synchronize_session=False)
                db.query(TroubleshootingNode).filter(TroubleshootingNode.version_id == tv.id).delete(synchronize_session=False)
                db.delete(tv)
            db.delete(tg)
        print(f"  - Deleted {len(tb_guides)} troubleshooting guides")
        
        # 4. Procedures and steps/runs
        procedures = db.query(Procedure).filter(Procedure.machine_id == mid).all()
        for proc in procedures:
            runs = db.query(ProcedureRun).filter(ProcedureRun.procedure_id == proc.id).all()
            for r in runs:
                db.query(ProcedureRunStep).filter(ProcedureRunStep.run_id == r.id).delete(synchronize_session=False)
                db.delete(r)
            db.query(ProcedureStep).filter(ProcedureStep.procedure_id == proc.id).delete(synchronize_session=False)
            db.delete(proc)
        print(f"  - Deleted {len(procedures)} procedures and runs")
        
        # 5. KnowledgeItems & KnowledgeVersions
        items = db.query(KnowledgeItem).filter(KnowledgeItem.machine_id == mid).all()
        for item in items:
            versions = db.query(KnowledgeVersion).filter(KnowledgeVersion.item_id == item.id).all()
            for v in versions:
                # Delete knowledge sources and chunks
                ks_list = db.query(KnowledgeSource).filter(KnowledgeSource.knowledge_version_id == v.id).all()
                for ks in ks_list:
                    # Clear message source citations first
                    db.query(ChatMessageSource).filter(ChatMessageSource.source_id == ks.id).delete(synchronize_session=False)
                    db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == ks.id).delete(synchronize_session=False)
                    db.delete(ks)
                db.query(MediaAsset).filter(MediaAsset.version_id == v.id).delete(synchronize_session=False)
                db.query(ApprovalRecord).filter(ApprovalRecord.version_id == v.id).delete(synchronize_session=False)
                db.query(ReviewComment).filter(ReviewComment.version_id == v.id).delete(synchronize_session=False)
                db.delete(v)
            db.delete(item)
        print(f"  - Deleted {len(items)} knowledge items and versions")
        
        # 6. Standalone KnowledgeSources pointing to this machine
        ks_standalone = db.query(KnowledgeSource).filter(KnowledgeSource.machine_id == mid).all()
        for ks in ks_standalone:
            db.query(ChatMessageSource).filter(ChatMessageSource.source_id == ks.id).delete(synchronize_session=False)
            db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == ks.id).delete(synchronize_session=False)
            db.delete(ks)
        print(f"  - Deleted {len(ks_standalone)} standalone knowledge sources")
        
        # 7. MediaAssets directly pointing to this machine
        media_count = db.query(MediaAsset).filter(MediaAsset.machine_id == mid).delete(synchronize_session=False)
        print(f"  - Deleted {media_count} media assets")
        
        # 8. AudioReferences pointing to this machine
        audio_count = db.query(AudioReference).filter(AudioReference.machine_id == mid).delete(synchronize_session=False)
        print(f"  - Deleted {audio_count} audio references")
        
        # 9. AudioAnalysisJobs pointing to this machine
        jobs_count = db.query(AudioAnalysisJob).filter(AudioAnalysisJob.machine_id == mid).delete(synchronize_session=False)
        print(f"  - Deleted {jobs_count} audio analysis jobs")
        
        # 10. ChatConversations pointing to this machine (set machine_id to null or delete)
        db.query(ChatConversation).filter(ChatConversation.machine_id == mid).update({"machine_id": None}, synchronize_session=False)
        
        # 11. KnowledgeEmbeddings
        db.query(KnowledgeEmbedding).filter(KnowledgeEmbedding.machine_id == mid).delete(synchronize_session=False)
        
        # 12. Finally, delete the machine itself
        db.delete(m)
        print(f"  [OK] Machine [{mid}] ({m.name}) deleted!")
        
    db.commit()
    print("\nMachine cleanup completed successfully.")

def verify_state(db: Session):
    print("\n" + "=" * 70)
    print("STEP 3: FINAL VERIFICATION")
    print("=" * 70)
    machines = db.query(Machine).all()
    print(f"Remaining machines count: {len(machines)}")
    for m in machines:
        docs = db.query(MediaAsset).filter(MediaAsset.machine_id == m.id, MediaAsset.kind == KIND_DOCUMENT).all()
        ks = db.query(KnowledgeSource).filter(KnowledgeSource.machine_id == m.id).all()
        ki = db.query(KnowledgeItem).filter(KnowledgeItem.machine_id == m.id).count()
        print(f"\nMachine [{m.id}] - '{m.name}' ({m.model_number}):")
        print(f"  Total Knowledge Items: {ki}")
        print(f"  Total Knowledge Sources: {len(ks)}")
        print(f"  Associated Documents in MediaAssets: {[d.title for d in docs]}")
        for k in ks:
            if k.source_type == "knowledge_base_document":
                print(f"  [OK] Linked KB Document: '{k.title}'")

if __name__ == "__main__":
    db = SessionLocal()
    try:
        associate_documents(db)
        remove_other_machines(db)
        verify_state(db)
    except Exception as e:
        db.rollback()
        print("ERROR:", e)
        raise
    finally:
        db.close()
