import os
import sys
import json
from datetime import datetime, timezone

# Ensure backend root is in python path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models import (
    Base,
    Role,
    Permission,
    RolePermission,
    User,
    UserPermission,
    MachineCategory,
    Machine,
    Tool,
    KnowledgeArticle,
    KnowledgeRevision,
    ReviewRecord,
    Procedure,
    ProcedureStep,
    TroubleshootingCase,
    TroubleshootingNode,
    TroubleshootingEdge,
    AudioReference,
    SimulationScenario,
    LearningPath,
    LearningItem,
    LearningAssignment,
    ProcedureRun,
    ProcedureRunStep,
    Notification,
)
from app.core.config import settings
from app.core.security import hash_password
from app.core.logging import logger
from app.core.permissions import (
    ROLE_ADMIN,
    ROLE_EXPERT,
    ROLE_OPERATOR,
    ROLE_TRAINEE,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
    PERM_KNOWLEDGE_SUBMIT_REVIEW,
    PERM_KNOWLEDGE_APPROVE,
    PERM_MACHINE_MANAGE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
    PERM_ASSISTANT_USE,
    PERM_AUDIT_VIEW,
    PERM_PROCEDURE_CREATE,
    PERM_PROCEDURE_EXECUTE,
    PERM_TROUBLESHOOT_USE,
    PERM_AUDIO_MANAGE,
    PERM_AUDIO_ANALYZE,
    PERM_SIMULATION_ATTEMPT,
    PERM_LEARNING_MANAGE,
    PERM_ADMIN_MANAGE,
)


def seed_database(db: Session) -> None:
    logger.info("Starting comprehensive database seeding for Gurukul AI...")

    # 1. Seed Roles
    roles_data = [
        {"id": ROLE_ADMIN, "name": "System Administrator", "description": "Full access to user administration, audit trails, and configuration"},
        {"id": ROLE_EXPERT, "name": "Manufacturing Expert", "description": "Author, engineer, and peer reviewer of technical knowledge and procedures"},
        {"id": ROLE_OPERATOR, "name": "Machine Operator", "description": "Floor operator executing approved workflows, troubleshooting, and sound analyses"},
        {"id": ROLE_TRAINEE, "name": "Workshop Trainee", "description": "Apprentice studying SOPs, guided procedures, and failure simulations"},
    ]
    for r in roles_data:
        existing = db.get(Role, r["id"])
        if not existing:
            db.add(Role(id=r["id"], name=r["name"], description=r["description"]))
            logger.info(f"Created role: {r['id']}")

    db.commit()

    # 2. Seed Permissions
    permissions_data = [
        {"id": PERM_KNOWLEDGE_CREATE, "description": "Create new knowledge articles and draft SOPs"},
        {"id": PERM_KNOWLEDGE_EDIT_OWN_DRAFT, "description": "Edit author's own knowledge drafts"},
        {"id": PERM_KNOWLEDGE_SUBMIT_REVIEW, "description": "Submit knowledge drafts for peer review"},
        {"id": PERM_KNOWLEDGE_APPROVE, "description": "Approve peer drafts and publish authoritative versions"},
        {"id": PERM_MACHINE_MANAGE, "description": "Register and manage machines, tools, and cell assets"},
        {"id": PERM_KNOWLEDGE_VIEW_PUBLISHED, "description": "Read published and verified SOP knowledge items"},
        {"id": PERM_ASSISTANT_USE, "description": "Query the grounded AI knowledge assistant"},
        {"id": PERM_AUDIT_VIEW, "description": "Inspect system audit trails and compliance logs"},
        {"id": PERM_PROCEDURE_CREATE, "description": "Author structured step-by-step procedures"},
        {"id": PERM_PROCEDURE_EXECUTE, "description": "Execute and record checklists for guided procedures"},
        {"id": PERM_TROUBLESHOOT_USE, "description": "Access expert decision trees and fault diagnostic guides"},
        {"id": PERM_AUDIO_MANAGE, "description": "Manage and upload baseline reference audio recordings"},
        {"id": PERM_AUDIO_ANALYZE, "description": "Upload machine sounds for acoustic reference matching"},
        {"id": PERM_SIMULATION_ATTEMPT, "description": "Participate in interactive failure simulation scenarios"},
        {"id": PERM_LEARNING_MANAGE, "description": "Create learning paths and assign modules to users"},
        {"id": PERM_ADMIN_MANAGE, "description": "Manage system settings and user accounts"},
    ]
    for p in permissions_data:
        existing = db.get(Permission, p["id"])
        if not existing:
            db.add(Permission(id=p["id"], description=p["description"]))
            logger.info(f"Created permission: {p['id']}")

    db.commit()

    # 3. Seed Role-Permissions
    all_perm_ids = [p["id"] for p in permissions_data]
    role_perms = {
        ROLE_ADMIN: all_perm_ids,
        ROLE_EXPERT: [
            PERM_KNOWLEDGE_CREATE,
            PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
            PERM_KNOWLEDGE_SUBMIT_REVIEW,
            PERM_KNOWLEDGE_APPROVE,
            PERM_MACHINE_MANAGE,
            PERM_KNOWLEDGE_VIEW_PUBLISHED,
            PERM_ASSISTANT_USE,
            PERM_AUDIT_VIEW,
            PERM_PROCEDURE_CREATE,
            PERM_PROCEDURE_EXECUTE,
            PERM_TROUBLESHOOT_USE,
            PERM_AUDIO_MANAGE,
            PERM_AUDIO_ANALYZE,
            PERM_SIMULATION_ATTEMPT,
            PERM_LEARNING_MANAGE,
        ],
        ROLE_OPERATOR: [
            PERM_KNOWLEDGE_VIEW_PUBLISHED,
            PERM_ASSISTANT_USE,
            PERM_PROCEDURE_EXECUTE,
            PERM_TROUBLESHOOT_USE,
            PERM_AUDIO_ANALYZE,
        ],
        ROLE_TRAINEE: [
            PERM_KNOWLEDGE_VIEW_PUBLISHED,
            PERM_ASSISTANT_USE,
            PERM_PROCEDURE_EXECUTE,
            PERM_TROUBLESHOOT_USE,
            PERM_SIMULATION_ATTEMPT,
            PERM_AUDIO_ANALYZE,
        ],
    }

    for role_id, pids in role_perms.items():
        for pid in pids:
            if not db.get(RolePermission, (role_id, pid)):
                db.add(RolePermission(role_id=role_id, permission_id=pid))

    db.commit()

    # 4. Seed Demo Users
    users_to_seed = [
        {
            "email": "admin@demo.local",
            "name": "Vikram Adityanath (Admin)",
            "role_id": ROLE_ADMIN,
            "password": "Admin@Gurukul2026!",
        },
        {
            "email": settings.EXPERT_A_EMAIL,
            "name": "Aarav Sharma (Author Expert)",
            "role_id": ROLE_EXPERT,
            "password": settings.EXPERT_A_PASSWORD,
        },
        {
            "email": settings.EXPERT_B_EMAIL,
            "name": "Bhavna Patel (Reviewer Expert)",
            "role_id": ROLE_EXPERT,
            "password": settings.EXPERT_B_PASSWORD,
        },
        {
            "email": "operator@demo.local",
            "name": "Rajesh Kumar (Senior Operator)",
            "role_id": ROLE_OPERATOR,
            "password": "Operator@Gurukul2026!",
        },
        {
            "email": settings.TRAINEE_EMAIL,
            "name": "Devendra Verma (Trainee)",
            "role_id": ROLE_TRAINEE,
            "password": settings.TRAINEE_PASSWORD,
        },
    ]

    created_users = {}
    for u in users_to_seed:
        user = db.query(User).filter(User.email == u["email"].lower().strip()).first()
        if not user:
            user = User(
                email=u["email"].lower().strip(),
                name=u["name"],
                password_hash=hash_password(u["password"]),
                role_id=u["role_id"],
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"Created demo user: {u['email']} [{u['role_id']}]")
        created_users[u["email"]] = user

    expert_a = created_users[settings.EXPERT_A_EMAIL]
    expert_b = created_users[settings.EXPERT_B_EMAIL]

    # 5. Seed Machine Categories & Machines
    categories = [
        {"id": "cnc-milling", "name": "CNC Milling Centers", "description": "3-axis to 5-axis vertical and horizontal CNC milling machines"},
        {"id": "cnc-turning", "name": "CNC Turning Centers", "description": "High-precision turning, live tooling, and multi-spindle lathes"},
        {"id": "hydraulic-presses", "name": "Hydraulic & Stamping", "description": "Heavy tonnage hydraulic and mechanical forming presses"},
        {"id": "grinding-finishing", "name": "Surface Grinding", "description": "Precision cylindrical and surface finishing machines"},
    ]
    for c in categories:
        if not db.get(MachineCategory, c["id"]):
            db.add(MachineCategory(id=c["id"], name=c["name"], description=c["description"]))
    db.commit()

    machines_data = [
        {
            "id": "mach-haas-vf2",
            "name": "HAAS VF-2 Vertical Machining Center",
            "model_number": "VF-2SS",
            "serial_number": "HAAS-VF2-2024-981",
            "manufacturer": "Haas Automation",
            "category_id": "cnc-milling",
            "location": "Bay 3 — Precision Milling Cell",
            "status": "ACTIVE",
            "specifications": "Spindle: 12,000 RPM 30HP, Travel: 30x16x20 in, Taper: CT40, Tool Capacity: 24+1 Side-Mount",
        },
        {
            "id": "mach-mazak-qt250",
            "name": "Mazak Quick Turn 250MSY Turning Center",
            "model_number": "QT-250MSY",
            "serial_number": "MZK-QT250-2023-412",
            "manufacturer": "Yamazaki Mazak",
            "category_id": "cnc-turning",
            "location": "Bay 1 — Shaft & Flange Cell",
            "status": "ACTIVE",
            "specifications": "Max Swing: 675mm, Main Spindle: 4,000 RPM, Sub-Spindle: 6,000 RPM, 12-Position Turret",
        },
        {
            "id": "mach-schuler-500",
            "name": "Schuler 500-Ton Hydraulic Forming Press",
            "model_number": "SHP-500-HD",
            "serial_number": "SCH-500-2021-089",
            "manufacturer": "Schuler Group",
            "category_id": "hydraulic-presses",
            "location": "Heavy Stamping Hall",
            "status": "MAINTENANCE",
            "specifications": "Nominal Force: 5,000 kN, Bolster: 2500x1500 mm, Stroke: 800 mm, Operating Pressure: 280 bar",
        },
    ]
    for m in machines_data:
        if not db.get(Machine, m["id"]):
            db.add(Machine(**m))
    db.commit()

    # 6. Seed Tools
    tools_data = [
        {
            "id": "tool-sandvik-390",
            "name": "Sandvik CoroMill 390 Shoulder Mill (50mm)",
            "tool_number": "T08-CM390-50",
            "machine_id": "mach-haas-vf2",
            "description": "True 90-degree shoulder milling cutter with through-coolant for aluminum and steel.",
            "specifications": "Diameter: 50mm, Inserts: 390R-11T308M-PM 4340, Max RPM: 14,000",
        },
        {
            "id": "tool-kennametal-endmill",
            "name": "Kennametal 12mm 4-Flute Solid Carbide Endmill",
            "tool_number": "T12-KSC-12F4",
            "machine_id": "mach-haas-vf2",
            "description": "Variable helix rougher/finisher for chatter reduction in deep cavity pocketing.",
            "specifications": "Diameter: 12mm, Flutes: 4, Coating: TiAlN, Max DOC: 24mm",
        },
    ]
    for t in tools_data:
        if not db.get(Tool, t["id"]):
            db.add(Tool(**t))
    db.commit()

    # 7. Seed Knowledge Articles & Approved Revisions
    articles_data = [
        {
            "id": "art-spindle-warmup",
            "title": "CNC Spindle Warm-Up & Thermal Drift Compensation Protocol",
            "machine_id": "mach-haas-vf2",
            "category": "MAINTENANCE",
            "tags": "spindle,warmup,thermal-drift,precision,tolerances",
            "status": "APPROVED",
            "current_version": 1,
            "author_id": expert_a.id,
            "revision": {
                "version": 1,
                "title": "CNC Spindle Warm-Up & Thermal Drift Compensation Protocol",
                "content": "Operating a cold spindle at high RPM (>6,000) causes uneven thermal growth of ceramic spindle bearings, leading to Z-axis drift of up to 18 microns. Always run the staggered warm-up routine before taking finishing cuts.",
                "operating_conditions": "Ambient Temp: 18-24°C; Minimum Idle Time before routine: 4 hours",
                "prerequisites": "Check way lube reservoir level, ensure air purge pressure is at 5.5 bar minimum.",
                "safety_warnings": "Clear spindle of all tools; verify table is clear of fixtures before starting cycle.",
                "common_mistakes": "Jumping directly to 10,000 RPM on cold morning shifts; leads to bearing galling.",
                "corrective_actions": "Run warm-up cycle O09021 (2000 RPM 5 min -> 5000 RPM 5 min -> 8000 RPM 3 min).",
                "author_id": expert_a.id,
                "changelog": "Initial baseline approved by Lead Reviewer Bhavna Patel.",
            },
            "review": {
                "reviewer_id": expert_b.id,
                "status": "APPROVED",
                "comments": "Verified against manufacturer specifications and thermal growth probe records.",
            },
        },
        {
            "id": "art-hydraulic-cavitation",
            "title": "Hydraulic Press Pump Cavitation & Oil Aeration Diagnostic Guide",
            "machine_id": "mach-schuler-500",
            "category": "TROUBLESHOOTING",
            "tags": "hydraulics,cavitation,pump,noise,press",
            "status": "APPROVED",
            "current_version": 1,
            "author_id": expert_b.id,
            "revision": {
                "version": 1,
                "title": "Hydraulic Press Pump Cavitation & Oil Aeration Diagnostic Guide",
                "content": "Pumping cavitation produces a distinctive metallic crackling or gravel-in-a-blender sound. Cavitation causes micro-explosions that pit axial piston slippers within 50 operating hours.",
                "operating_conditions": "Hydraulic Oil Temp: 40-55°C (ISO VG 46)",
                "prerequisites": "Suction line vacuum gauge, reservoir sight glass inspection.",
                "safety_warnings": "High-pressure oil injection hazard. Depressurize accumulator before servicing suction strainers.",
                "common_mistakes": "Over-tightening suction fittings causing air induction under negative pressure.",
                "corrective_actions": "Clean suction strainer basket; inspect reservoir return line baffles for foaming.",
                "author_id": expert_b.id,
                "changelog": "Verified procedure after 2024 pump rebuild.",
            },
            "review": {
                "reviewer_id": expert_a.id,
                "status": "APPROVED",
                "comments": "Approved. Excellent acoustic symptom description.",
            },
        },
        {
            "id": "art-aluminum-chatter",
            "title": "Eliminating High-Frequency Chatter in Aluminum 6061-T6 Thin Walls",
            "machine_id": "mach-haas-vf2",
            "category": "OPERATING_PROCEDURE",
            "tags": "aluminum,milling,chatter,harmonics,thin-wall",
            "status": "PENDING_REVIEW",
            "current_version": 1,
            "author_id": expert_a.id,
            "revision": {
                "version": 1,
                "title": "Eliminating High-Frequency Chatter in Aluminum 6061-T6 Thin Walls",
                "content": "Thin web structures (<2mm) vibrate harmonically at 1,250 Hz. To suppress resonance without sacrificing MRR, stagger spindle speed by +/- 7% dynamically or use differential pitch endmills.",
                "operating_conditions": "Cutting speed Vc: 450 m/min, Emulsion concentration: 8-10%",
                "prerequisites": "Zero backlash check on Y-axis ballscrew; verify hydraulic vise clamping pressure.",
                "safety_warnings": "Chips are razor sharp; verify chip conveyor interlock before high-feed tests.",
                "common_mistakes": "Increasing clamping pressure to stop chatter; this deflects the workpiece permanently.",
                "corrective_actions": "Switch to 3-flute unequal helix geometry; tune feed to maintain 0.08mm chip load.",
                "author_id": expert_a.id,
                "changelog": "Draft submitted for expert peer review.",
            },
            "review": None,
        },
    ]

    for a in articles_data:
        art = db.get(KnowledgeArticle, a["id"])
        if not art:
            art = KnowledgeArticle(
                id=a["id"],
                title=a["title"],
                machine_id=a["machine_id"],
                category=a["category"],
                tags=a["tags"],
                status=a["status"],
                current_version=a["current_version"],
                author_id=a["author_id"],
            )
            db.add(art)
            db.commit()

            rev_data = a["revision"]
            ver_status = "published" if a["status"] == "APPROVED" else ("in_review" if a["status"] == "PENDING_REVIEW" else "draft")
            now = datetime.now(timezone.utc)
            rev = KnowledgeRevision(
                article_id=art.id,
                version=rev_data["version"],
                title=rev_data["title"],
                machine_id=a["machine_id"],
                status=ver_status,
                origin="expert",
                summary=rev_data["content"],
                content=rev_data["content"],
                steps=rev_data["content"],
                operating_conditions=rev_data["operating_conditions"],
                prerequisites=rev_data["prerequisites"],
                safety_warnings=rev_data["safety_warnings"],
                common_mistakes=rev_data["common_mistakes"],
                corrective_actions=rev_data["corrective_actions"],
                author_id=rev_data["author_id"],
                changelog=rev_data["changelog"],
                published_at=now if ver_status == "published" else None,
                submitted_at=now if ver_status in ["published", "in_review"] else None,
            )
            db.add(rev)
            db.commit()

            if ver_status == "published":
                art.current_published_version_id = rev.id
                db.commit()

            if a["review"]:
                r_data = a["review"]
                review = ReviewRecord(
                    article_id=art.id,
                    revision_id=rev.id,
                    reviewer_id=r_data["reviewer_id"],
                    decision=r_data["status"].lower(),
                    comment=r_data["comments"],
                )
                db.add(review)
                db.commit()


    # 8. Seed Procedures & Steps
    proc_id = "proc-haas-preflight"
    if not db.get(Procedure, proc_id):
        proc = Procedure(
            id=proc_id,
            title="HAAS VF-2 Daily Pre-Flight & Spindle Zero Alignment",
            description="Mandatory daily inspection, air pressure verification, way lube check, and dial indicator spindle zeroing.",
            machine_id="mach-haas-vf2",
            author_id=expert_a.id,
            status="APPROVED",
            version=1,
            prerequisites="Clean worktable, lock-out tag-out key verified, safety glasses and steel-toe boots required.",
            required_tools="0.001mm Dial Test Indicator with magnetic base, Spindle test bar, lint-free wipes.",
            safety_warnings="Do NOT actuate spindle with test bar or dial indicator in contact. Keep door interlocks engaged.",
        )
        db.add(proc)
        db.commit()

        steps = [
            {
                "step_order": 1,
                "title": "Air Pressure & Pneumatic Condensate Inspection",
                "instruction": "Inspect main pneumatic regulator on rear service panel. Gauge must read between 5.8 and 6.5 bar (85-95 PSI). Press manual drain petcock to purge condensed moisture.",
                "expected_observation": "Dry air hiss with zero water droplets; needle stable above 85 PSI.",
                "safety_warning": "High pressure air discharge. Wear eye protection.",
                "is_critical": True,
            },
            {
                "step_order": 2,
                "title": "Way Lube Reservoir & Automatic Oiler Pressure Check",
                "instruction": "Verify Mobil Vactra No. 2 level in transparent reservoir on left column. Check that system pressure pulses to 35 PSI during self-test cycle.",
                "expected_observation": "Oil level between MIN and MAX markers; no sediment in intake filter.",
                "safety_warning": "Wipe away any spills immediately to eliminate slip hazards.",
                "is_critical": True,
            },
            {
                "step_order": 3,
                "title": "Spindle Runout Verification with Precision Test Bar",
                "instruction": "Clean CT40 taper with felt wiper. Mount 250mm precision ground test bar into spindle. Position 0.001mm dial indicator at 150mm extension and rotate spindle by hand through 360°.",
                "expected_observation": "Total Indicator Reading (TIR) must not exceed 0.004 mm (4 microns).",
                "safety_warning": "Spindle must be in E-STOP or NEUTRAL mode when rotating by hand.",
                "is_critical": True,
            },
        ]
        for s in steps:
            db.add(ProcedureStep(procedure_id=proc.id, **s))
        db.commit()

    # 9. Seed Troubleshooting Decision Tree
    ts_id = "case-vibration-chatter"
    if not db.get(TroubleshootingCase, ts_id):
        tsc = TroubleshootingCase(
            id=ts_id,
            title="Excessive Tool Vibration & Surface Chatter on Turning Center",
            machine_id="mach-mazak-qt250",
            symptom="Wavy surface finish (Ra > 3.2 µm) accompanied by loud high-pitch screeching during OD roughing passes.",
            severity="HIGH",
            created_by=expert_b.id,
            is_published=True,
        )
        db.add(tsc)
        db.commit()

        # Nodes
        n1 = TroubleshootingNode(
            id="node-vibr-root",
            case_id=tsc.id,
            node_type="QUESTION",
            title="Check Tool Overhang Ratio",
            description="Is the tool stick-out length greater than 4 times the shank diameter / bar diameter (L/D > 4)?",
            safety_warning="Stop spindle and wait for turret to come to complete rest before measuring.",
            is_root=True,
        )
        n2 = TroubleshootingNode(
            id="node-vibr-overhang-action",
            case_id=tsc.id,
            node_type="ACTION",
            title="Reduce Tool Stick-out",
            description="Loosen turret wedge clamp and push tool shank back to achieve L/D <= 3. Re-clamp at 65 Nm.",
            safety_warning=None,
            is_root=False,
        )
        n3 = TroubleshootingNode(
            id="node-vibr-insert-check",
            case_id=tsc.id,
            node_type="QUESTION",
            title="Inspect Carbide Insert Cutting Edge",
            description="Under magnifying loupe, do you see chipping, built-up edge (BUE), or flank wear > 0.3mm?",
            safety_warning="Hot workpiece and chips. Allow 2 minutes cooling before handling insert.",
            is_root=False,
        )
        n4 = TroubleshootingNode(
            id="node-vibr-index-insert",
            case_id=tsc.id,
            node_type="ACTION",
            title="Index or Replace Insert Corner",
            description="Index to a fresh insert corner. Ensure pocket is free of chips before seating insert screw.",
            safety_warning=None,
            is_root=False,
        )
        n5 = TroubleshootingNode(
            id="node-vibr-escalate",
            case_id=tsc.id,
            node_type="ESCALATION",
            title="Escalate to Maintenance: Spindle Bearings or Turret Backlash",
            description="Tool geometry is confirmed correct. Vibration suggests spindle preload loss or curvic coupling wear. Tag machine for mechanical maintenance.",
            safety_warning="Do not operate machine above 1,500 RPM while awaiting inspection.",
            is_root=False,
        )

        db.add_all([n1, n2, n3, n4, n5])
        db.commit()

        # Edges
        e1 = TroubleshootingEdge(case_id=tsc.id, from_node_id=n1.id, to_node_id=n2.id, label="Yes (L/D > 4)")
        e2 = TroubleshootingEdge(case_id=tsc.id, from_node_id=n1.id, to_node_id=n3.id, label="No (L/D <= 3)")
        e3 = TroubleshootingEdge(case_id=tsc.id, from_node_id=n3.id, to_node_id=n4.id, label="Yes (Edge Worn)")
        e4 = TroubleshootingEdge(case_id=tsc.id, from_node_id=n3.id, to_node_id=n5.id, label="No (Edge Perfect)")
        db.add_all([e1, e2, e3, e4])
        db.commit()

    # 10. Seed Audio Reference Recordings
    audio_refs = [
        {
            "id": "audio-spindle-normal",
            "title": "HAAS VF-2 Normal Spindle Idle (6,000 RPM)",
            "machine_id": "mach-haas-vf2",
            "file_path": "audio/references/spindle_normal_6000rpm.wav",
            "duration_seconds": 12.5,
            "sample_rate": 22050,
            "fault_label": "Normal Operation",
            "is_expert_verified": True,
            "operating_conditions": "No cut, warm spindle, 6,000 RPM, clean way lube",
            "features_json": json.dumps({"centroid": 1420.5, "bandwidth": 1850.2, "rms": 0.045, "zcr": 0.068}),
            "uploaded_by": expert_a.id,
        },
        {
            "id": "audio-bearing-defect",
            "title": "Spindle Bearing Fluting & High-Pitch Whine Fault",
            "machine_id": "mach-haas-vf2",
            "file_path": "audio/references/bearing_fluting_whine.wav",
            "duration_seconds": 15.0,
            "sample_rate": 22050,
            "fault_label": "Spindle Bearing Damage (Inner Race Fluting)",
            "is_expert_verified": True,
            "operating_conditions": "Idle at 4,000 RPM, prominent 2,840 Hz harmonic spike",
            "features_json": json.dumps({"centroid": 2840.1, "bandwidth": 920.4, "rms": 0.082, "zcr": 0.145}),
            "uploaded_by": expert_b.id,
        },
        {
            "id": "audio-press-cavitation",
            "title": "Hydraulic Pump Cavitation Gravel Sound",
            "machine_id": "mach-schuler-500",
            "file_path": "audio/references/hydraulic_cavitation.wav",
            "duration_seconds": 10.0,
            "sample_rate": 22050,
            "fault_label": "Hydraulic Pump Cavitation",
            "is_expert_verified": True,
            "operating_conditions": "Press stroke advance, 240 bar, oil temperature 32°C",
            "features_json": json.dumps({"centroid": 3120.0, "bandwidth": 2400.0, "rms": 0.110, "zcr": 0.190}),
            "uploaded_by": expert_b.id,
        },
    ]
    for ar in audio_refs:
        if not db.get(AudioReference, ar["id"]):
            db.add(AudioReference(**ar))
    db.commit()

    # 11. Seed Simulation Scenario
    sim_id = "sim-coolant-loss"
    if not db.get(SimulationScenario, sim_id):
        sim = SimulationScenario(
            id=sim_id,
            title="High-Pressure Coolant Loss During Deep Pocket Roughing",
            description="While machining 4140 pre-hardened alloy steel at 280 m/min, the through-spindle coolant flow drops to 0 bar. Smoke begins escaping the enclosure.",
            machine_id="mach-haas-vf2",
            difficulty="INTERMEDIATE",
            initial_state_json=json.dumps({
                "spindle_rpm": 7200,
                "feed_rate_mm_min": 1800,
                "coolant_pressure_bar": 0.2,
                "smoke_level": "Rising rapidly",
                "sound": "Harsh screeching and friction squeal",
            }),
            scenario_tree_json=json.dumps({
                "step_1": {
                    "question": "The coolant alarm sounds and smoke is visible through the safety window. What is your immediate action?",
                    "options": [
                        {"id": "opt_feed_hold", "text": "Press FEED HOLD immediately, then inspect through door", "correct": False, "consequence": "Feed hold stops axis motion but leaves spindle spinning at 7,200 RPM against dry steel, causing catastrophic insert welding and potential fire."},
                        {"id": "opt_e_stop", "text": "Press EMERGENCY STOP to kill spindle and all axis drives instantly", "correct": True, "consequence": "Correct action! E-STOP halts spindle rotation and motion simultaneously, preventing tool explosion and fire."},
                        {"id": "opt_open_door", "text": "Open the safety door to vent the smoke", "correct": False, "consequence": "CRITICAL SAFETY VIOLATION: Door interlock override with spinning hot spindle exposes operator to flying carbide fragments and toxic smoke."},
                    ],
                }
            }),
            completion_criteria="Correctly prioritize Emergency Stop over Feed Hold; verify zero thermal damage to spindle taper.",
            created_by=expert_a.id,
        )
        db.add(sim)
        db.commit()

    # 12. Seed Learning Path
    lp_id = "lp-cnc-fundamentals"
    if not db.get(LearningPath, lp_id):
        lp = LearningPath(
            id=lp_id,
            title="CNC Machinist Level 1: Foundations & Safe Operation",
            description="Core onboarding curriculum for workshop trainees covering pre-flight checks, thermal stabilization, and emergency protocols.",
            target_role="TRAINEE",
            created_by=expert_a.id,
        )
        db.add(lp)
        db.commit()

        items = [
            {"path_id": lp.id, "item_type": "PROCEDURE", "reference_id": proc_id, "order_index": 1, "title": "Daily Pre-Flight & Spindle Zero Alignment"},
            {"path_id": lp.id, "item_type": "ARTICLE", "reference_id": "art-spindle-warmup", "order_index": 2, "title": "Thermal Drift & Spindle Warm-Up Protocol"},
            {"path_id": lp.id, "item_type": "SIMULATION", "reference_id": sim_id, "order_index": 3, "title": "Coolant Loss Emergency Response Simulation"},
        ]
        for itm in items:
            db.add(LearningItem(**itm))
        db.commit()

    # 13. Seed Trainee Curriculum Assignment & Progress
    trainee_user = db.query(User).filter(User.email == settings.TRAINEE_EMAIL.lower().strip()).first()
    if trainee_user:
        # Assign learning path if not already assigned
        existing_assignment = (
            db.query(LearningAssignment)
            .filter(LearningAssignment.user_id == trainee_user.id, LearningAssignment.path_id == lp_id)
            .first()
        )
        if not existing_assignment:
            assignment = LearningAssignment(
                path_id=lp_id,
                user_id=trainee_user.id,
                status="IN_PROGRESS",
                progress_percentage=33,
            )
            db.add(assignment)
            db.commit()
            logger.info("Assigned curriculum to trainee.")

        # Seed an in-progress procedure run
        existing_run = (
            db.query(ProcedureRun)
            .filter(ProcedureRun.operator_id == trainee_user.id, ProcedureRun.procedure_id == proc_id)
            .first()
        )
        if not existing_run:
            run = ProcedureRun(
                procedure_id=proc_id,
                operator_id=trainee_user.id,
                status="IN_PROGRESS",
            )
            db.add(run)
            db.commit()
            db.refresh(run)

            # Mark step 1 completed
            proc = db.get(Procedure, proc_id)
            if proc and proc.steps:
                for idx, step in enumerate(proc.steps):
                    is_done = (idx == 0)
                    step_exec = ProcedureRunStep(
                        run_id=run.id,
                        step_id=step.id,
                        is_completed=is_done,
                        operator_notes="Dial indicator measured 0.002mm runout; verified within HAAS VF-2 tolerances." if is_done else None,
                        verified_at=datetime.now(timezone.utc) if is_done else None,
                    )
                    db.add(step_exec)
                db.commit()
            logger.info("Created in-progress procedure run for trainee.")

        # Seed Trainee Notifications
        if db.query(Notification).filter(Notification.user_id == trainee_user.id).count() == 0:
            notifications = [
                Notification(
                    user_id=trainee_user.id,
                    title="Curriculum Assigned",
                    message="You have been enrolled in 'CNC Machinist Level 1: Foundations & Safe Operation'.",
                    link="/app/learning-paths",
                    is_read=False,
                ),
                Notification(
                    user_id=trainee_user.id,
                    title="Procedure In Progress",
                    message="Daily Pre-Flight & Spindle Zero Alignment: Step 1 completed. Step 2 ready for execution.",
                    link="/app/guided-workflows",
                    is_read=False,
                ),
                Notification(
                    user_id=trainee_user.id,
                    title="Upcoming Simulation",
                    message="Emergency Coolant Loss Response Simulation scheduled for intermediate level evaluation.",
                    link="/app/failure-simulator",
                    is_read=True,
                ),
            ]
            for n in notifications:
                db.add(n)
            db.commit()
            logger.info("Seeded trainee notifications.")

    logger.info("Comprehensive database seeding completed successfully.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
