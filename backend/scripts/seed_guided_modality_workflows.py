"""Add modality-specific, source-linked guided workflows to the four active machines.

Run from ``backend`` with the project virtual environment after machine media has
been imported. The script is additive and idempotent: it never alters existing
procedures or runs. Step narration is synthesized in the browser by the
frontend's SpeechSynthesis control; selected ECG/MRI sound references are
attached as supplementary media where they are available.

These workflows are phantom/simulator training material. The active machine
records do not identify manufacturer models, so device-specific numeric
settings are intentionally omitted. The installed manufacturer's instructions,
local protocols, and qualified staff remain authoritative.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.procedure import Procedure, ProcedureStep
from app.models.user import User


SOURCES: dict[str, dict[str, str]] = {
    "acr_ct_qc": {
        "title": "ACR Quality Control: CT",
        "publisher": "American College of Radiology",
        "url": "https://accreditationsupport.acr.org/support/solutions/articles/11000056188-quality-control-ct",
    },
    "fda_xray": {
        "title": "Medical X-ray Imaging: Safety and Quality",
        "publisher": "U.S. Food and Drug Administration",
        "url": "https://www.fda.gov/radiation-emitting-products/medical-imaging/medical-x-ray-imaging",
    },
    "acr_mr_safety": {
        "title": "ACR Manual on MR Safety 2026 and safety resources",
        "publisher": "American College of Radiology",
        "url": "https://develop.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/radiology-safety/mr-safety",
    },
    "fda_ecg_guide": {
        "title": "12-Lead ECG Monitoring Setup, X Series Operator's Guide",
        "publisher": "U.S. FDA AccessData (ZOLL operator guide)",
        "url": "https://www.accessdata.fda.gov/cdrh_docs/pdf16/P160022C.pdf",
    },
    "nhs_ecg": {
        "title": "12 lead ECG: placement and acquisition guidance",
        "publisher": "NHS Borders Clinical Guidelines",
        "url": "https://admin.rightdecisions.scot.nhs.uk/nhs-borders-clinical-guidelines/cardiology/12-lead-ecg/",
    },
}


def source_refs(*keys: str) -> list[dict[str, str]]:
    return [dict(SOURCES[key]) for key in keys]


def step(
    title: str,
    instruction: str,
    expected: str,
    image_terms: tuple[str, ...],
    refs: tuple[str, ...],
    *,
    warning: str | None = None,
    critical: bool = False,
    checklist: tuple[str, ...] = (),
    tools: tuple[str, ...] = (),
    stop: str | None = None,
    audio_terms: tuple[str, ...] = (),
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "title": title,
        "instruction": instruction,
        "expected": expected,
        "image_terms": image_terms,
        "source_refs": source_refs(*refs),
        "warning": warning,
        "critical": critical,
        "checklist": list(checklist),
        "tools": list(tools),
        "stop": stop,
        "audio_terms": audio_terms,
        "note": note,
    }


WORKFLOWS: list[dict[str, Any]] = [
    {
        "key": "ct_daily_phantom_qc_v1",
        "machine": "ct-scan",
        "title": "CT Daily Phantom QC and Image-Quality Release",
        "operation": "CT | Daily phantom QC",
        "description": "A supervised, patient-free CT quality-control path using the site's approved phantom and written QC procedure. It checks readiness, the approved QC setup, image quality, and the release record.",
        "prerequisites": "For trained CT staff with local authorization. Use a phantom only. The qualified medical physicist (QMP), site QC procedure, and installed scanner manual define the exact tests, settings, limits, and release decision.",
        "required_tools": "Approved CT QC phantom; current local QC checklist; console access authorized for training; QC log; required protective equipment under site policy.",
        "safety": "Training path only: do not scan a patient. Do not change technique, calibration, or service settings. Follow local radiation protection, access controls, and the installed model's manual. Stop and escalate any failed interlock, alarm, unexpected motion, or QC result outside local limits.",
        "conditions": "Training/QC session only; no patient on the table; room access controlled; a qualified supervisor is available.",
        "docs": ("Good Practice Guide CT", "quality control in computed tomography"),
        "refs": ("acr_ct_qc", "fda_xray"),
        "steps": [
            step("Confirm scanner identity and QC release status", "Match the console and room label to the CT unit being checked. Review the service status, due-date board, and prior QC log before touching controls. If the unit is out of service or its QC status is unclear, stop and contact the supervisor.", "The correct unit is identified, service status is current, and the local QC checklist is available.", ("general equipment", "ctmachine", "CT scanner"), ("acr_ct_qc",), critical=True, checklist=("Correct room and unit confirmed", "Service status checked", "Current local QC procedure available"), tools=("Room/unit label", "QC log"), stop="A service hold, open fault, or missing QC procedure is present."),
            step("Inspect the gantry, table, and phantom", "Check the accessible gantry and table surfaces for visible damage, obstruction, or contamination. Inspect the approved phantom and its labels. Do not remove covers or attempt service work.", "No visible damage or obstruction is found; the approved phantom is intact.", ("CT simulator", "64-slice", "CT scanner"), ("acr_ct_qc",), checklist=("Table path is clear", "Phantom identity and condition checked", "No covers opened"), tools=("Approved CT phantom", "Site cleaning supplies"), stop="Any mechanical damage, liquid ingress, or phantom defect is seen."),
            step("Place and align the approved phantom", "Using the local phantom procedure, position the phantom on the table and align it with the scanner's designated reference marks. Use the phantom manufacturer's orientation and the site alignment method; do not substitute a patient or improvised object.", "The phantom is secured and centered according to the written site procedure.", ("CT scanner", "CT simulator", "gantry"), ("acr_ct_qc",), critical=True, checklist=("Correct phantom and orientation confirmed", "Alignment performed using the local reference marks", "No person is in the scan path"), tools=("Approved CT phantom", "Alignment marks"), stop="The phantom cannot be aligned securely or the table/gantry moves unexpectedly."),
            step("Select the written phantom QC protocol", "Open only the site-approved QC protocol for this phantom. Compare the displayed protocol name and technique factors with the current written procedure. Leave all numeric settings unchanged; refer any mismatch to the supervisor or QMP.", "The displayed protocol matches the approved QC checklist without an unapproved override.", ("CT controls", "console", "CT machine"), ("acr_ct_qc", "fda_xray"), critical=True, checklist=("Phantom QC protocol selected", "Displayed factors match local approved procedure", "No unapproved manual override"), tools=("Approved QC protocol", "Current local checklist"), stop="The protocol, settings, or software screen do not match the local instruction."),
            step("Acquire the phantom QC scan under supervision", "Run the QC acquisition only when the authorized supervisor confirms the room is clear and the phantom setup is correct. Use the scanner's approved QC workflow; do not start a clinical examination from this training path.", "A phantom-only QC dataset is acquired without a warning or interruption.", ("CT scanner", "CT simulator", "gantry"), ("acr_ct_qc", "fda_xray"), critical=True, checklist=("Room-clear check complete", "Supervisor authorizes the phantom scan", "No patient or bystander is in the room"), tools=("Approved QC protocol", "Approved CT phantom"), stop="A safety warning appears, the scan is interrupted, or anyone enters the controlled room."),
            step("Review image quality and daily QC measures", "Review the prescribed phantom images for the locally required water CT number/noise measures and visible artifacts. Compare results only with the site's current action limits and QMP-approved worksheet; do not invent thresholds or adjust calibration.", "Required values and artifact review are recorded against local limits; any out-of-limit result is flagged.", ("CT image", "CT scanner", "64-slice"), ("acr_ct_qc",), checklist=("Required phantom images reviewed", "Results compared with site action limits", "Any exception marked for QMP review"), tools=("QC worksheet", "Image review workstation"), stop="A result is outside the site's action limits or an unexplained artifact is present."),
            step("Document the outcome and hand off exceptions", "Record the unit, phantom/protocol, date, results, operator, and any action taken in the site's QC log. Release the scanner only through the site's established authorization process; escalate unresolved faults to the QMP/service team.", "The log is complete and the release/hold state follows the site's documented QC policy.", ("CT scanner", "hospital CT", "CT machine"), ("acr_ct_qc",), checklist=("QC log completed", "Exceptions and handoff documented", "Release state follows local policy"), tools=("QC log", "Service escalation contact"), note="Routine QC duties and thresholds vary by site and scanner. The ACR guidance says to follow written procedures and manufacturer specifications, with QMP oversight."),
        ],
    },
    {
        "key": "ct_protocol_dry_run_v1",
        "machine": "ct-scan",
        "title": "CT Protocol Selection and Dose-Review Simulator",
        "operation": "CT | Protocol and dose review",
        "description": "A patient-free console rehearsal that teaches staff to select a locally approved CT protocol, inspect the scan plan, and review dose indicators without changing scanner settings or exposing a patient.",
        "prerequisites": "Trained staff and a supervisor. Use a phantom or the console's designated training mode only. The ordering clinician, local protocol team, QMP, and exact model manual govern clinical protocol selection and technique factors.",
        "required_tools": "CT console training mode or phantom; site-approved protocol chart; local dose-review worksheet; supervisor.",
        "safety": "No patient exposure is part of this rehearsal. Never select or modify patient technique values from this generic guide. A clinical scan requires a justified request, correct patient workflow, authorized operator, and the site's approved protocol.",
        "conditions": "Console training mode or phantom session; patient workflow closed; changes are not saved to clinical protocols.",
        "docs": ("dose optimization", "CT dose index determination"),
        "refs": ("fda_xray", "acr_ct_qc"),
        "steps": [
            step("Open the training case and confirm its purpose", "Choose the site-provided phantom scenario or console training case. Confirm that the screen is in training/QC mode and contains no patient identifiers. Use the site's task description to identify the anatomy and image-quality goal being rehearsed.", "A non-patient training case is open with its learning objective visible.", ("CT simulator", "CT scanner", "CT machine"), ("fda_xray",), checklist=("Training/QC mode confirmed", "No patient identifiers entered", "Scenario objective understood"), tools=("Approved training case", "Supervisor"), stop="A clinical patient record or real examination is open."),
            step("Find the site-approved protocol for the scenario", "Use the site's protocol chart to locate the approved profile for the stated task and phantom. Confirm the protocol name and version with the supervisor. Do not choose a profile based only on a similar name or another scanner model.", "The selected profile is the one specified by the site's current protocol chart.", ("CT console", "controls", "CT machine"), ("fda_xray", "acr_ct_qc"), critical=True, checklist=("Scenario matches protocol purpose", "Protocol chart version checked", "Profile approved for this unit"), tools=("Local protocol chart", "Supervisor"), stop="No matching approved profile is available."),
            step("Review displayed settings without editing them", "Read the displayed scan mode, range, and technique factors against the approved profile. Treat all numbers as review-only in this exercise. If anything differs, capture the discrepancy for the protocol/QMP team instead of correcting it at the console.", "The profile is reviewed and any mismatch is reported; no clinical setting is changed.", ("CT controls", "console", "64-slice"), ("fda_xray",), critical=True, checklist=("Displayed factors compared to approved profile", "No numeric values edited", "Mismatch reported through local process"), tools=("Local protocol chart", "Discrepancy log"), stop="A value differs from the approved protocol or an override is active."),
            step("Check scan range and reconstruction plan", "Review the planned phantom coverage and reconstruction options against the scenario card. Confirm the area is limited to the intended training target and that the selected reconstructions are those specified locally. Do not broaden the range or add a clinical reconstruction.", "The displayed range and reconstruction plan match the phantom exercise card.", ("CT simulator", "CT scanner", "CT-scan"), ("acr_ct_qc", "fda_xray"), checklist=("Phantom coverage matches the training card", "Reconstruction plan matches local procedure", "No patient protocol is being modified"), tools=("Scenario card", "Console training mode"), stop="Coverage extends beyond the phantom or the protocol is ambiguous."),
            step("Review dose optimization indicators", "For the phantom dataset, locate the dose indices shown by the system, such as CTDIvol and DLP where available. Record them for review against the site's own baseline and QMP-approved limits; do not treat a value from another scanner or facility as a target.", "Dose indicators are captured with the phantom scenario and compared only with local guidance.", ("CT scanner", "CT simulator", "hospital CT"), ("fda_xray",), checklist=("Dose indicators captured", "Comparison uses local baseline", "Unexpected values flagged for review"), tools=("Dose-review worksheet", "QMP contact"), stop="An indicator is unexpectedly high/low or the site's baseline is unavailable."),
            step("Close the rehearsal and document learning points", "Exit the training screen without saving changes to clinical protocols. Record the approved profile reviewed, any discrepancy, and the supervisor's follow-up. Reset the phantom area for the next session.", "Training changes are discarded and the review record is complete.", ("CT scanner", "CT-scan", "CT machine"), ("acr_ct_qc", "fda_xray"), checklist=("No training change saved as a clinical protocol", "Review notes filed", "Work area reset"), tools=("Training log", "Site reset procedure")),
        ],
    },
    {
        "key": "mri_zone_coil_readiness_v1",
        "machine": "mri",
        "title": "MRI Zone Safety and Coil Readiness",
        "operation": "MRI | Safety and setup",
        "description": "A safety-first MRI-room readiness path for trained MR personnel, using an approved phantom for setup practice. It focuses on access zones, screening, equipment labeling, coil selection, and the final check.",
        "prerequisites": "Only personnel trained and authorized under the site's MR safety policy. Use a phantom for this training path. Follow the current ACR MR Safety Manual, local MR Medical Director policy, and the exact scanner/coil labeling.",
        "required_tools": "Site zone map and screening form; approved MR-safe phantom; device/coil labeling; local emergency and communication procedure.",
        "safety": "The static magnetic field may remain present when the scanner is idle. Do not admit an unscreened person, object, cart, or accessory to restricted MR zones. Never infer MR safety from appearance. Stop for unresolved implant/device questions, missing labeling, alarm, or loss of access control.",
        "conditions": "No patient scan; controlled MR environment; MR-trained supervisor present; phantom only.",
        "docs": ("MRI Technical Operations Manual", "MRI safety"),
        "refs": ("acr_mr_safety",),
        "steps": [
            step("Confirm the MR team and training boundary", "Confirm the designated MR supervisor is present and that everyone participating is authorized for the zones they will enter. State that this is a phantom training exercise; do not bring a patient into this practice path.", "Authorized personnel and the patient-free training scope are confirmed.", ("MRI room", "MRI scanner", "RF shielding"), ("acr_mr_safety",), critical=True, checklist=("MR supervisor identified", "Participants' zone access is authorized", "Phantom-only scope confirmed"), tools=("Site MR policy", "Zone map"), stop="A participant's authorization or training scope is unclear."),
            step("Apply the site zone map and access controls", "Identify the site's controlled MR zones and the door/access boundary from the posted map. Verify that restricted access controls and warning signs are in place. Keep non-MR personnel and unverified equipment outside the restricted area.", "Zone boundaries are clear and restricted areas remain controlled.", ("MRI room", "MRI installation", "RF shielding"), ("acr_mr_safety",), critical=True, checklist=("Posted zone map checked", "Access controls working", "Unverified equipment remains outside"), tools=("Posted MR zone map", "Door/interlock check"), stop="A restricted entry point cannot be controlled."),
            step("Complete the written safety screen", "For each person and every object intended to cross the restricted boundary, follow the site's screening and labeling workflow. Resolve implant, device, foreign-body, or equipment questions through the MR safety process; never guess from appearance or a prior visit.", "Every person and object has a documented clearance decision before entry.", ("MRI room", "MRI suite", "equipment installation"), ("acr_mr_safety",), critical=True, checklist=("Person screening complete", "Equipment labels and conditions checked", "Unresolved item held outside the zone"), tools=("MR screening form", "Device/implant policy"), stop="Any implant/device status or equipment label is unresolved."),
            step("Choose and inspect the approved phantom coil", "Select the coil designated for the training phantom from the site-approved list. Check its label, connector, cable, and visible condition, and confirm the coil's conditions of use for this scanner. Do not substitute a coil based on physical fit alone.", "The coil is labeled for the scanner and phantom task, with no visible damage.", ("MRI coil", "MRI scanner", "MRI system"), ("acr_mr_safety",), checklist=("Coil identity and labeling checked", "Correct scanner/task confirmed", "Cable and connector inspected"), tools=("Approved MR coil", "Phantom setup sheet"), stop="The coil's MR conditions or scanner compatibility cannot be confirmed."),
            step("Perform the final room and communication check", "Before bringing the phantom into the bore, recheck that no unverified item is in the restricted zone, the table path is clear, and the site's communication and emergency procedure is ready. Follow the local hearing-protection policy for the training scan.", "The room is cleared and the supervisor confirms the site final-check procedure is complete.", ("MRI room", "MRI scanner", "RF shielding"), ("acr_mr_safety",), critical=True, checklist=("No unverified objects in the zone", "Table path clear", "Communication and hearing-protection plan ready"), tools=("Site final-check list", "Approved hearing protection"), stop="A person/object screening concern or an equipment warning remains open."),
        ],
    },
    {
        "key": "mri_phantom_sequence_qa_v1",
        "machine": "mri",
        "title": "MRI Phantom Sequence Setup and QA Review",
        "operation": "MRI | Phantom QA",
        "description": "A patient-free MRI phantom workflow for choosing the site's approved QA sequence, checking coil/setup geometry, reviewing image quality, and recording results without inventing scanner parameters.",
        "prerequisites": "MR-trained and locally authorized staff; MR safety screening and zone controls completed; approved phantom and written QA protocol available. The site physicist and installed scanner/coil manuals define the sequence and acceptance criteria.",
        "required_tools": "Approved MRI system phantom; compatible coil; local QA sequence sheet; image review workstation; QA log; supervisor.",
        "safety": "Phantom only; do not use this workflow for patient scanning or diagnosis. Do not change TR, TE, flip angle, SAR, gradient, or other sequence values from this generic guide. Follow current MR zone, screening, hearing-protection, and equipment-label requirements.",
        "conditions": "MR safety release completed; no patient; phantom sequence selected from the installed unit's approved QA protocol.",
        "docs": ("MRI Technical Operations Manual", "standard system phantom"),
        "refs": ("acr_mr_safety",),
        "steps": [
            step("Verify the phantom and local QA sequence", "Match the phantom identifier and coil to the site's written MRI QA procedure. Open the named QA sequence on the correct scanner and verify its revision against the local worksheet; do not use a clinical patient protocol as a substitute.", "Phantom, coil, scanner, and QA sequence are the combination specified by the site.", ("MRI scanner", "phantom", "MRI system"), ("acr_mr_safety",), checklist=("Phantom identifier confirmed", "Coil compatibility confirmed", "QA sequence revision checked"), tools=("Approved MRI phantom", "Local QA sequence sheet", "Approved coil"), stop="The phantom, coil, or protocol cannot be matched to the local worksheet."),
            step("Position the phantom and connect the coil", "Place and orient the phantom according to its instructions and the local QA setup. Connect the approved coil and route its cable using the manufacturer and site method. Keep all other equipment out of the bore unless its MR labeling permits the exact use.", "The phantom is stable, centered, and connected with the approved coil arrangement.", ("MRI phantom", "MRI scanner", "MRI coil"), ("acr_mr_safety",), critical=True, checklist=("Phantom orientation follows the setup sheet", "Coil connection checked", "No unverified object is near the bore"), tools=("Approved phantom", "Compatible coil"), stop="The phantom cannot be positioned or the cable/coil is damaged."),
            step("Review settings against the approved QA card", "Compare the displayed sequence name and parameter values with the site-approved QA card. This guide provides no numeric settings; make no changes. If a value differs, stop and ask the MRI physicist or supervisor to resolve it.", "The on-screen setup matches the local approved QA card without an unapproved edit.", ("MRI scanner", "MRI controls", "MRI system"), ("acr_mr_safety",), critical=True, checklist=("Sequence name matches the QA card", "Values reviewed without editing", "Mismatch escalated"), tools=("Local QA card", "MRI console"), stop="Any value, coil, or sequence does not match the approved QA card."),
            step("Run the supervised phantom sequence", "Confirm the restricted room is clear and the final MR safety check is complete. Start the approved phantom sequence under the assigned supervisor. Monitor the console for alarms and follow local hearing protection and communication procedures.", "The phantom sequence completes without unresolved safety alerts.", ("MRI scanner", "MRI system", "MRI suite"), ("acr_mr_safety",), critical=True, checklist=("Final room check completed", "Supervisor authorizes the run", "Alarms and communication monitored"), tools=("Approved QA sequence", "Site hearing protection"), audio_terms=("MRI scanner operation recording",), stop="An alarm, communication failure, or unexpected equipment behavior occurs."),
            step("Review phantom images against local criteria", "Review the prescribed QA images for the measures and artifacts listed on the site worksheet. Compare against locally established baselines and physicist-defined action limits; do not diagnose from the phantom or apply thresholds from another scanner.", "Required QA observations are recorded and deviations are clearly flagged.", ("MRI image", "MRI phantom", "MRI scanner"), ("acr_mr_safety",), checklist=("All prescribed images reviewed", "Local baselines/action limits used", "Deviation escalated for physicist review"), tools=("Image review workstation", "Local MRI QA worksheet"), stop="An artifact or value is outside the site's action limits."),
            step("Log the session and return the room to ready state", "Record scanner, coil, phantom, sequence name/revision, operator, results, and service/QMP follow-up. Remove the phantom and return the coil using the site handling procedure. Do not clear an equipment hold without the assigned approver.", "The MRI QA log is complete and room status follows local policy.", ("MRI scanner", "MRI room", "MRI installation"), ("acr_mr_safety",), checklist=("QA result and sequence recorded", "Follow-up owner assigned if needed", "Phantom and coil stored correctly"), tools=("MRI QA log", "Local coil storage procedure")),
        ],
    },
    {
        "key": "ecg_12lead_simulator_v1",
        "machine": "ecg",
        "title": "12-Lead ECG Simulator Setup and Capture",
        "operation": "ECG | 12-lead capture",
        "description": "A non-patient 12-lead ECG training path covering cable checks, electrode mapping, simulator setup, trace-quality review, and clean handoff. It teaches acquisition mechanics, not interpretation or diagnosis.",
        "prerequisites": "For trained staff under local policy. Use an ECG simulator or approved training manikin only. Follow the exact device manual and the site's electrode-label convention (AHA or IEC); patient care requires the appropriate order, consent, privacy, and qualified supervision.",
        "required_tools": "ECG device and compatible 10-electrode cable; simulator/manikin; in-date compatible electrodes; local capture checklist; training log.",
        "safety": "Training/simulator only; no patient is connected in this workflow. Do not interpret rhythm or make clinical decisions from the training trace. Verify cable labeling because AHA and IEC colors differ; follow local infection-control and privacy procedures for any separately authorized patient procedure.",
        "conditions": "Device self-test complete; simulator selected; training identifiers only; no patient data stored.",
        "docs": ("Electrocardiogram (ECG) Technical & Operations Guide", "ECG signal quality"),
        "refs": ("fda_ecg_guide", "nhs_ecg"),
        "steps": [
            step("Prepare the ECG unit and simulator", "Confirm the unit is assigned for training, review its self-test/status message, and connect the approved ECG simulator. Use a training label only; do not enter a real patient's identifiers.", "The unit passes its available self-check and displays a simulator signal path.", ("ECG machine", "ECG device", "BTL-08"), ("fda_ecg_guide",), critical=True, checklist=("Unit status checked", "Compatible simulator connected", "Training-only identifier used"), tools=("ECG unit", "Approved ECG simulator"), stop="The unit reports a fault or a real patient record is open."),
            step("Inspect the cable and electrode set", "Check the 10-electrode cable, lead labels, connector pins, and electrode expiry/condition. Confirm that the cable convention matches the device and local protocol; use the FDA-hosted operator guide only as a cross-check, not as a substitute for the installed model manual.", "Cable and electrode supplies are intact, compatible, and correctly labeled.", ("ECG cable", "electrodes", "ECG connector"), ("fda_ecg_guide", "nhs_ecg"), checklist=("Cable and connector inspected", "Electrode set in date", "AHA/IEC label convention confirmed"), tools=("Compatible ECG cable", "In-date training electrodes"), stop="A lead is damaged, labels are ambiguous, or the set is incompatible."),
            step("Place the 10 electrodes on the training manikin", "Apply RA, LA, RL, and LL to their designated limb sites and V1-V6 to the manikin's marked chest landmarks, using the convention shown by the device and the local training diagram. For the standard chest landmarks, V1/V2 sit at the fourth intercostal space at the right/left sternal borders; V4 is at the fifth intercostal space on the midclavicular line, V3 midway between V2 and V4, and V5/V6 at the V4 level on the anterior/midaxillary lines.", "All ten electrodes match the manikin landmarks and the device's lead map.", ("BTL ECG electrodes", "electrodes", "ECG cable"), ("fda_ecg_guide", "nhs_ecg"), critical=True, checklist=("Four limb electrodes mapped correctly", "V1/V2 landmarks checked", "V3-V6 follow the local diagram", "No cable tension on the connectors"), tools=("Training manikin", "Electrodes", "Local placement diagram"), stop="A landmark or lead label is uncertain; ask the supervisor before capture."),
            step("Select the resting 12-lead simulator profile", "Choose the simulator's approved resting 12-lead training profile and verify the displayed lead set. Do not change device gain, speed, filter, or interpretation options unless the training card explicitly calls for it and the supervisor authorizes the exercise.", "The selected profile is identified as simulator training and the expected lead set is displayed.", ("ECG device", "ECG machine", "Nihon Kohden"), ("fda_ecg_guide",), checklist=("Resting 12-lead simulator profile selected", "Lead set display checked", "No unapproved setting changed"), tools=("Simulator profile card", "ECG unit"), stop="The profile or lead set does not match the local exercise."),
            step("Record and review acquisition quality", "Start the simulator trace and inspect for lead-off indicators, missing channels, baseline instability, or obvious contact/motion artifacts. Review signal quality only; do not interpret the pattern as a patient rhythm or diagnose a condition.", "The training trace has all expected channels and no unresolved lead-off alert.", ("ECG machine", "ECG display", "heart monitor"), ("fda_ecg_guide", "nhs_ecg"), checklist=("All expected leads are present", "Lead-off alerts resolved", "Training trace labeled as simulation"), tools=("ECG display/printer", "Simulator"), audio_terms=("60-beat-per-minute illustrative beep",), stop="Lead-off or signal quality remains poor after the local troubleshooting check."),
            step("Save the training record and clean the equipment", "Save/export only to the approved training location with a simulation label. Remove training electrodes, discard them according to site policy, clean the reusable leads/device as specified by the manufacturer, and record any fault for service.", "No patient data is saved and the unit is clean, intact, and ready for the next authorized use.", ("ECG cable", "ECG machine", "ECG device"), ("fda_ecg_guide", "nhs_ecg"), checklist=("Training label preserved", "No patient data stored", "Cleaning and fault log completed"), tools=("Training record location", "Approved cleaning supplies")),
        ],
    },
    {
        "key": "ecg_signal_quality_lab_v1",
        "machine": "ecg",
        "title": "ECG Lead-Off and Artifact Troubleshooting Lab",
        "operation": "ECG | Signal-quality lab",
        "description": "A simulator-only troubleshooting lab for checking lead mapping, cable integrity, electrode contact, and acquisition artifacts. It never asks trainees to interpret a clinical trace.",
        "prerequisites": "Use an ECG simulator/manikin and the unit's approved lead set. Follow the exact installed device manual and the site's AHA/IEC convention. A damaged cable or persistent fault must be escalated to biomedical engineering/service.",
        "required_tools": "ECG simulator with approved signal-quality exercise; compatible cable; training electrodes; local troubleshooting card; fault log.",
        "safety": "Do not connect a patient to deliberately create an artifact. Do not use this lab to interpret rhythms. Never bypass a lead-off warning or use a damaged lead cable.",
        "conditions": "Simulator only; patient lead cable disconnected from any patient; fault states created only with the simulator's training function.",
        "docs": ("ECG signal quality", "ECG Technical & Operations Guide"),
        "refs": ("fda_ecg_guide", "nhs_ecg"),
        "steps": [
            step("Open a simulator signal-quality exercise", "Select a built-in training scenario on the ECG simulator, such as a lead-off or motion-artifact example. Do not disconnect, short, or damage a real cable to create a fault.", "The simulator indicates a training scenario and no patient is attached.", ("ECG machine", "ECG device", "PC-based electrocardiogram"), ("fda_ecg_guide",), critical=True, checklist=("Simulator exercise selected", "No patient cable in use", "Scenario type recorded"), tools=("ECG simulator", "Training card"), stop="The fault would require manipulating a patient connection or damaged cable."),
            step("Read the lead-off indicator and identify the channel", "Use the unit's display to identify which lead is flagged. Compare the label on the screen with the cable's AHA/IEC marking and the local crosswalk; do not infer a lead from color alone.", "The flagged channel and cable label are documented using the correct convention.", ("ECG cable", "ECG connector", "ECG device"), ("fda_ecg_guide", "nhs_ecg"), checklist=("Screen label noted", "Cable convention checked", "Channel mapping matched to local crosswalk"), tools=("Local AHA/IEC crosswalk", "ECG unit"), stop="Screen labels and cable markings cannot be reconciled."),
            step("Inspect the cable path and connectors", "Power down or place the unit in the safe state specified by its manual before inspecting the connector. Look for bent pins, fraying, stretched strain reliefs, or loose connectors. Do not open the device housing or attempt a repair.", "No cable or connector damage is present; any suspected defect is tagged out.", ("ECG cable", "ECG connector", "ECG electrodes"), ("fda_ecg_guide",), checklist=("Safe state followed", "Cable jacket and strain relief inspected", "No housing opened"), tools=("Compatible spare cable", "Fault tag"), stop="A damaged connector or cable is found."),
            step("Check simulator electrode contact", "Re-seat the training electrodes on the simulator/manikin at the documented locations. Confirm each snap connection is firm and the simulator pad is clean and dry. For a real patient procedure, skin preparation and consent/privacy requirements are governed by the local clinical protocol; this simulator step does not replace them.", "The simulator contacts are clean, dry, and seated without cable pull.", ("BTL ECG electrodes", "ECG cable", "electrodes"), ("fda_ecg_guide", "nhs_ecg"), checklist=("Simulator pads clean and dry", "Electrode snaps fully seated", "Cables routed without tension"), tools=("Training electrodes", "Simulator/manikin")),
            step("Repeat capture and check signal quality only", "Repeat the simulator capture using the same approved training profile. Confirm the lead-off message clears and expected channels return. Observe artifact reduction without interpreting the displayed waveform as a clinical rhythm.", "The simulator status is clear and expected channels are present.", ("ECG display", "ECG machine", "monitor"), ("fda_ecg_guide", "nhs_ecg"), checklist=("Lead-off alert state recorded", "Expected channels visible", "No clinical interpretation made"), tools=("ECG simulator", "Training log"), audio_terms=("Illustrative heart-monitor beep",), stop="The alert persists or the simulator output remains inconsistent."),
            step("Tag, document, and escalate persistent faults", "If the issue persists, stop using the unit for clinical work, follow the local equipment hold procedure, and report the fault to the supervisor or biomedical service. Record the unit, cable, simulator scenario, and observed alert without entering patient data.", "A persistent problem is safely held and routed to the correct service owner.", ("ECG machine", "ECG device", "ECG cable"), ("fda_ecg_guide",), critical=True, checklist=("Persistent fault escalated", "Equipment status tagged per local procedure", "No patient data included in the report"), tools=("Fault log", "Service contact"), stop="A persistent fault is present; do not return the unit to clinical use until released."),
        ],
    },
    {
        "key": "xray_daily_phantom_qc_v1",
        "machine": "xray",
        "title": "Digital X-ray Phantom QC and Room Readiness",
        "operation": "X-ray | Daily phantom QC",
        "description": "A patient-free digital radiography readiness and phantom QC path focused on room controls, detector condition, approved technique charts, collimation, image review, and documented release.",
        "prerequisites": "Trained and locally authorized radiography staff; phantom only; current site QC checklist and technique chart; supervisor available. The local radiation protection program, qualified medical physicist, and exact equipment manual govern tests and limits.",
        "required_tools": "Approved radiography QC phantom; detector; site QC/technique chart; image review workstation; QC log; required dosimetry/PPE under site policy.",
        "safety": "Training/QC only; never expose a patient from this path. Follow room access, warning light, door interlock, protective barrier, and ALARA procedures. Do not invent or change exposure factors. Stop for an interlock fault, missing warning, equipment damage, or result outside local limits.",
        "conditions": "No patient; room controlled; phantom QC mode/preset; authorized supervisor present.",
        "docs": ("X-Ray Equipment Operation & Maintenance Manual", "digital general X-ray quality assurance"),
        "refs": ("fda_xray",),
        "steps": [
            step("Confirm authorization and room status", "Check the unit identity, operator authorization, service/hold status, warning indicators, and room access procedure. Confirm the approved QC checklist and that the exercise uses a phantom only.", "The room and unit are released for a supervised phantom QC session.", ("X-ray controls", "X-ray machine", "general equipment photo"), ("fda_xray",), critical=True, checklist=("Unit identity and service status checked", "Operator authorization confirmed", "Warning lights and access controls checked"), tools=("Local QC checklist", "Room status board"), stop="A warning light/interlock is faulty, a service hold is active, or authorization is unclear."),
            step("Inspect the detector, table, and tube assembly", "Visually inspect the accessible detector, table/Bucky, cable connections, and tube housing for damage or obstruction. Clean only with the approved method. Do not remove covers or perform service adjustments.", "Accessible components are intact, clean, and unobstructed.", ("Bucky table", "ceiling-mounted", "X-ray tube"), ("fda_xray",), checklist=("Detector surface checked", "Table path clear", "Tube/collimator has no visible damage"), tools=("Approved cleaning materials", "Site inspection form"), stop="Damage, liquid ingress, loose hardware, or a cable fault is seen."),
            step("Load the local phantom QC chart", "Select the site's QC preset or technique chart for this specific unit and phantom. Compare the displayed selection with the current written procedure and unit label. Do not copy exposure factors from another model or this generic guide.", "The exact local phantom QC profile is displayed and no values have been edited.", ("X-ray controls", "X-ray machine", "digital X-ray"), ("fda_xray",), critical=True, checklist=("Correct unit-specific QC chart selected", "Phantom protocol confirmed", "No unapproved numeric changes"), tools=("Current QC chart", "Supervisor"), stop="No current unit-specific QC chart is available."),
            step("Position the phantom and collimate the field", "Place and center the approved phantom according to the QC worksheet. Use the light field and local landmarks to collimate to the intended phantom area only. Confirm the room is clear and everyone is behind the protective barrier before exposure.", "Phantom is aligned, the field is limited to the QC target, and the room-clear check is complete.", ("collimator", "Bucky table", "X-ray controls"), ("fda_xray",), critical=True, checklist=("Phantom position matches worksheet", "Light field covers the intended QC area", "All staff behind protective barrier"), tools=("Approved phantom", "Light field/collimator", "QC worksheet"), stop="The field cannot be restricted or a person is in the room/primary beam."),
            step("Make one supervised phantom exposure", "Only the authorized operator may trigger the phantom exposure after the final room-clear check. Use the local approved QC technique; do not initiate any patient examination or repeat exposure unless the written QC procedure requires it and the supervisor agrees.", "The QC image is acquired using the written local method, with no person exposed.", ("X-ray unit", "Bucky table", "X-ray controls"), ("fda_xray",), critical=True, checklist=("Authorized operator confirmed", "Local technique used", "No person in the room during exposure"), tools=("Approved phantom", "Protective barrier"), stop="Any person enters the controlled area or an exposure warning appears."),
            step("Review image quality, dose indicators, and release status", "Review phantom coverage, visible image-quality criteria, and displayed dose indicators using the local QC worksheet and action limits. Document the result and hold/escalate the unit if results fall outside limits; release only through the facility's established process.", "The image and dose review are documented and the release/hold state follows local policy.", ("X-ray image", "X-ray controls", "DigitalDiagnost"), ("fda_xray",), checklist=("Phantom image reviewed", "Local criteria and dose indicators recorded", "Exceptions escalated", "Release state assigned by local policy"), tools=("Image review workstation", "QC log", "QMP/service contact"), stop="An out-of-limit value, artifact, or unexplained exposure issue is found."),
        ],
    },
    {
        "key": "xray_positioning_collimation_lab_v1",
        "machine": "xray",
        "title": "Radiography Positioning and Technique-Chart Practice",
        "operation": "X-ray | Positioning and collimation",
        "description": "A phantom-only rehearsal for choosing the approved projection setup, aligning the detector and tube, checking the light field, and reviewing the resulting image without using a patient.",
        "prerequisites": "Trained radiography staff and supervisor. Use an approved phantom and current unit-specific technique chart. Clinical positioning, justification, exposure selection, and patient communication require local authorization and clinical policy.",
        "required_tools": "Radiography phantom; detector/Bucky as required by the training case; current projection/technique chart; positioning aids; protective barrier; image review workstation.",
        "safety": "Phantom only. Do not use this generic rehearsal to select patient exposure factors. Apply ALARA, local room controls, and the site's protective barrier/interlock procedure. Do not expose until the authorized operator confirms the room is clear.",
        "conditions": "Training case selected; no patient present; only the approved phantom is in the beam path.",
        "docs": ("X-Ray Equipment Operation & Maintenance Manual", "standardisation and optimisation of chest and pelvis"),
        "refs": ("fda_xray",),
        "steps": [
            step("Choose the phantom projection scenario", "Select the projection named on the training card and confirm the image receptor/table configuration required by the site's procedure. Use the phantom's markers to represent the target anatomy; do not use patient identifiers.", "Projection and receptor setup match the training card.", ("Bucky table", "X-ray machine", "mobile C-arm"), ("fda_xray",), checklist=("Training projection selected", "Receptor/table configuration checked", "Phantom only"), tools=("Training card", "Approved phantom", "Detector"), stop="The projection or receptor setup is not clear."),
            step("Set the receptor and tube geometry", "Move the detector and tube using the site's approved handling controls. Align the central ray to the phantom reference point using the local marker and equipment labels. Keep hands and cables clear of pinch points; do not force a movement limit.", "The receptor and tube are aligned to the phantom marker without a collision or limit warning.", ("Bucky table", "ceiling-mounted", "X-ray tube"), ("fda_xray",), checklist=("Central-ray marker aligned", "Detector and tube stable", "No cable or collision hazard"), tools=("Positioning aids", "Phantom reference marks"), stop="A collision warning, hard stop, or unstable component occurs."),
            step("Set the light field to the training target", "Use the collimator light and the local projection guide to limit the field to the phantom region required for the exercise. Compare the light field to the receptor boundaries and intended coverage; do not broaden the field to compensate for uncertain positioning.", "The light field is centered and limited to the training target.", ("collimator", "X-ray controls", "Bucky table"), ("fda_xray",), critical=True, checklist=("Light field centered to phantom marks", "Coverage matches the training card", "Field is not unnecessarily wide"), tools=("Collimator light", "Projection guide"), stop="The light field or collimator indicator does not behave as expected."),
            step("Verify the technique chart without editing values", "Select the unit-specific technique chart row for the phantom exercise and confirm it is the currently approved local version. Read settings as prescribed by that chart; this training data contains no numeric exposure factors and does not authorize changes.", "The correct chart row is selected, with no unapproved setting change.", ("X-ray controls", "X-ray machine", "general equipment photo"), ("fda_xray",), critical=True, checklist=("Current chart version checked", "Correct unit and phantom row selected", "No value copied from another model"), tools=("Unit-specific technique chart", "Supervisor"), stop="A chart is missing, expired, or does not match the unit."),
            step("Run the supervised phantom exposure", "Confirm the room-clear condition and protective barrier. The authorized operator may make the exposure using the local chart and training phantom. Keep everyone outside the controlled room and do not repeat unless the procedure requires it.", "A phantom-only image is produced under the approved local technique.", ("X-ray unit", "X-ray machine", "Bucky table"), ("fda_xray",), critical=True, checklist=("Room-clear check repeated", "Authorized operator triggers exposure", "No person is exposed"), tools=("Approved phantom", "Protective barrier"), stop="The room-clear check fails or the system reports an exposure fault."),
            step("Review coverage and save the training result", "Confirm the image covers the intended phantom target, inspect for positioning/collimation errors, and review the displayed dose indicator against local guidance. Label the record as training, document the technique-chart row used, and reset the room.", "The training record is labeled, reviewed, and stored without patient identifiers.", ("X-ray image", "X-ray controls", "DigitalDiagnost"), ("fda_xray",), checklist=("Coverage and collimation reviewed", "Dose indicator checked against local guidance", "Training record saved", "Room reset"), tools=("Image review workstation", "Training log"), stop="Coverage is inadequate, the indicator is unexpected, or the image is mislabeled."),
        ],
    },
]


MACHINE_NAME_ALIASES = {
    "ct-scan": ("ct-scan", "ct scan", "ct"),
    "ecg": ("ecg", "electrocardiogram"),
    "mri": ("mri", "magnetic resonance imaging"),
    "xray": ("xray", "x-ray", "radiography"),
}


def _norm(value: str | None) -> str:
    return " ".join((value or "").casefold().replace("-", " ").split())


def _asset_search_text(asset: MediaAsset) -> str:
    return _norm(" ".join((asset.title or "", asset.original_name or "", asset.description or "", asset.tags or "")))


def _choose_asset(assets: list[MediaAsset], terms: tuple[str, ...], used: set[str] | None = None) -> MediaAsset | None:
    used = used or set()
    candidates = [asset for asset in assets if asset.id not in used]
    for term in terms:
        token = _norm(term)
        match = next((asset for asset in candidates if token and token in _asset_search_text(asset)), None)
        if match:
            return match
    if candidates:
        return candidates[0]
    return next((asset for asset in assets if not used), None)


def _find_machine(db, modality: str) -> Machine:
    aliases = {_norm(name) for name in MACHINE_NAME_ALIASES[modality]}
    candidates = db.query(Machine).filter(Machine.is_active.is_(True)).all()
    machine = next((item for item in candidates if _norm(item.name) in aliases), None)
    if not machine:
        raise RuntimeError(f"No active {modality} machine was found. No workflows were written.")
    return machine


def _make_workflow(db, author: User, machine: Machine, blueprint: dict[str, Any], image_use: set[str]) -> Procedure:
    workflow_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"gurukul-guided-workflow:{machine.id}:{blueprint['key']}"))
    existing = db.get(Procedure, workflow_id)
    if existing:
        return existing

    machine_assets = db.query(MediaAsset).filter(MediaAsset.machine_id == machine.id).all()
    images = [asset for asset in machine_assets if asset.kind == "image"]
    audios = [asset for asset in machine_assets if asset.kind == "audio"]
    documents = [asset for asset in machine_assets if asset.kind == "document"]
    # These two accidental legacy image uploads are unrelated to MRI equipment.
    if machine.name.casefold() == "mri":
        images = [asset for asset in images if asset.original_name.casefold() not in {"mastercard.jpeg", "xray.webp"}]
    if not images:
        raise RuntimeError(f"{machine.name} has no machine-library images. No workflows were written.")

    selected_asset_ids: set[str] = set()
    steps: list[ProcedureStep] = []
    for order, item in enumerate(blueprint["steps"], 1):
        image = _choose_asset(images, item["image_terms"], image_use)
        if not image:
            raise RuntimeError(f"No image is available for {machine.name}: {item['title']}")
        image_use.add(image.id)
        asset_ids = [image.id]
        selected_asset_ids.add(image.id)

        audio = _choose_asset(audios, item.get("audio_terms", ())) if item.get("audio_terms") else None
        if audio:
            asset_ids.append(audio.id)
            selected_asset_ids.add(audio.id)

        model_note = (
            f"Machine photo: {image.title}. This is an illustrative reference, not confirmation of the exact {machine.name} hardware or control layout. "
            "Match controls and labels to the installed manufacturer's manual and the local procedure."
        )
        notes = " ".join(part for part in (item.get("note"), model_note) if part)
        narration = f"{item['title']}. {item['instruction']} Expected observation: {item['expected']}"
        if item.get("warning"):
            narration += f" Safety note: {item['warning']}"

        details: dict[str, Any] = {
            "asset_ids": asset_ids,
            "notes": notes,
            "narration_text": narration,
            "source_refs": item["source_refs"],
            "quality_checkpoints": item["checklist"],
            "tools": item["tools"],
        }
        if item.get("stop"):
            details["stop_condition"] = item["stop"]
        if item.get("audio_terms") and audio:
            details["audio_note"] = "Supplementary reference sound only; it is not a machine-specific fault signature. Step narration is available with Listen to step."

        steps.append(ProcedureStep(
            step_order=order,
            title=item["title"],
            instruction=item["instruction"],
            expected_observation=item["expected"],
            safety_warning=item.get("warning"),
            is_critical=item["critical"],
            details=details,
        ))

    support_docs: list[MediaAsset] = []
    used_docs: set[str] = set()
    for term in blueprint["docs"]:
        document = _choose_asset(documents, (term,), used_docs)
        if document:
            support_docs.append(document)
            used_docs.add(document.id)
            selected_asset_ids.add(document.id)

    procedure = Procedure(
        id=workflow_id,
        title=blueprint["title"],
        description=blueprint["description"],
        machine_id=machine.id,
        author_id=author.id,
        status="APPROVED",
        version=1,
        prerequisites=blueprint["prerequisites"],
        required_tools=blueprint["required_tools"],
        safety_warnings=blueprint["safety"],
        operating_conditions=blueprint["conditions"],
        operation=blueprint["operation"],
        source_refs=source_refs(*blueprint["refs"]),
        steps=steps,
        media_assets=[asset for asset in machine_assets if asset.id in selected_asset_ids],
    )
    db.add(procedure)
    return procedure


def seed_guided_workflows() -> dict[str, int]:
    db = SessionLocal()
    try:
        author = db.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        if not author:
            raise RuntimeError("The configured Expert A account was not found; no workflows were written.")

        machines = {modality: _find_machine(db, modality) for modality in MACHINE_NAME_ALIASES}
        image_use: dict[str, set[str]] = {modality: set() for modality in machines}
        created = 0
        existing_count = 0

        # Build all workflows before committing so missing media cannot leave a partial set.
        prepared = []
        for blueprint in WORKFLOWS:
            modality = blueprint["machine"]
            machine = machines[modality]
            deterministic_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"gurukul-guided-workflow:{machine.id}:{blueprint['key']}"))
            existing = db.get(Procedure, deterministic_id)
            if existing:
                # Older runs of this script temporarily put an internal seed key
                # into the public citation list. Keep only actual source links.
                clean_refs = [ref for ref in (existing.source_refs or []) if "manifest_key" not in ref]
                if clean_refs != (existing.source_refs or []):
                    existing.source_refs = clean_refs
                existing_count += 1
                continue
            prepared.append(_make_workflow(db, author, machine, blueprint, image_use[modality]))

        db.commit()
        created = len(prepared)
        return {"created": created, "already_present": existing_count, "active_machines": len(machines)}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    summary = seed_guided_workflows()
    print(
        "Guided workflow seed complete: "
        f"{summary['created']} created, {summary['already_present']} already present, "
        f"{summary['active_machines']} active machines covered."
    )
