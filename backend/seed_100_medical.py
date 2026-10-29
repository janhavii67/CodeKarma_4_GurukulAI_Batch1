import os, io, time, sys, requests
import numpy as np, soundfile as sf

BASE = 'http://localhost:8000/api/v1'
EA = {'email':'expert.a@demo.local','password':'ExpertA@Gurukul2026!'}
EB = {'email':'expert.b@demo.local','password':'ExpertB@Gurukul2026!'}
H  = 'X-CSRF-Token'
SR = 16000

MACHINES = {
    'xray':  'e13400d3-faab-48bc-811a-6a30c78a0b76',
    'ct':    '4a49fee7-d54b-4898-b653-2e7f8f6d91bc',
    'mri':   '2c615e42-6e10-419c-826d-8835812eca18',
    'ecg':   '6baa63bc-044a-45fe-afcd-69c67a80f224',
}

def wav(s):
    b=io.BytesIO(); sf.write(b,np.clip(s,-0.9,0.9),SR,format='WAV',subtype='PCM_16'); return b.getvalue()
def t(d=2.0): return np.arange(int(d*SR),dtype=np.float32)/SR
def si(f,a=0.35,d=2.0): return a*np.sin(2*np.pi*f*t(d))
def ha(f0,n=5,d=2.0,dk=0.6):
    tv=t(d); s=sum((dk**(k-1))*np.sin(2*np.pi*f0*k*tv) for k in range(1,n+1))
    return (s/max(float(np.abs(s).max()),1e-6)*0.35).astype(np.float32)
def nz(a=0.08,d=2.0,sd=0): return (np.random.default_rng(sd).standard_normal(int(d*SR))*a).astype(np.float32)
def ck(r,d=2.0,a=0.40):
    s=np.zeros(int(d*SR),dtype=np.float32); p=int(SR/r)
    for i in range(0,len(s),p): s[i:i+6]=a
    return s
def am(fc,fm,a=0.35,d=2.0):
    tv=t(d); return (0.5*(1+np.sin(2*np.pi*fm*tv))*a*np.sin(2*np.pi*fc*tv)).astype(np.float32)
def sw(f0,f1,d=2.0,a=0.32):
    tv=t(d); k=(f1-f0)/d; return (a*np.sin(2*np.pi*(f0*tv+0.5*k*tv**2))).astype(np.float32)
def pulse(rate,width=0.05,amp=0.45,d=2.0,sd=0):
    s=np.zeros(int(d*SR),dtype=np.float32); p=int(SR/rate); w=int(SR*width)
    rng=np.random.default_rng(sd)
    for i in range(0,len(s),p):
        start=i; s[max(0,start):max(0,start)+w]=amp
    return s.astype(np.float32)

REFS = [
# X-RAY 25
{'m':'xray','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'HV Generator','op':'Tube warm-up 80kV 100mA','oc':'Cold start morning','title':'X-Ray HV Generator Normal Warm-Up Hum','interp':'Steady 150 Hz generator hum during warm-up. Normal baseline. No action needed.','note':'Recorded 2 min after power-on.','fn':lambda: wav(ha(150,n=4)+nz(0.02,sd=10))},
{'m':'xray','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'Collimator Motor','op':'Collimator field-size adjustment','oc':'Routine AP chest setup','title':'X-Ray Collimator Motor Normal Movement','interp':'Short 220 Hz motor burst during collimator adjustment. Normal.','note':'Sound lasts 0.5-1 s per adjustment.','fn':lambda: wav(am(220,3.0)+nz(0.03,sd=11))},
{'m':'xray','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'Definium 6000','cmp':'Tube Cooling Fan','op':'Post-exposure tube cooling','oc':'After 5 consecutive exposures','title':'X-Ray Tube Cooling Fan Normal Operation','interp':'Steady 310 Hz cooling fan post-exposure. Fan speed proportional to heat load. Normal.','note':'Fan auto-stops when anode temperature returns to baseline.','fn':lambda: wav(ha(310,n=3,dk=0.55)+nz(0.025,sd=12))},
{'m':'xray','lbl':'normal_operation','mfr':'Philips','mdl':'DigitalDiagnost C90','cmp':'Exposure Relay','op':'Single AP lumbar spine exposure','oc':'125kV 200mA 0.05s','title':'X-Ray Exposure Relay Click Normal','interp':'Single sharp relay click at exposure start and end. Normal contactor operation.','note':'Double-click expected: arming plus firing.','fn':lambda: wav(ck(1.2,d=2.0,a=0.50)+nz(0.01,sd=13))},
{'m':'xray','lbl':'normal_operation','mfr':'Canon Medical','mdl':'CXDI-810C','cmp':'Table Motor','op':'Patient table horizontal travel','oc':'Tableside positioning','title':'X-Ray Patient Table Motor Normal Travel','interp':'Smooth 180 Hz table drive motor hum during horizontal positioning. No irregularity.','note':'Motor hum should be steady.','fn':lambda: wav(ha(180,n=3,dk=0.65)+nz(0.02,sd=14))},
{'m':'xray','lbl':'alarm','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'Alarm Speaker','op':'Tube overload alarm triggered','oc':'Exceeding 80kHU tube heat capacity','title':'X-Ray Tube Overload Alarm','interp':'Rapid 960 Hz alarm at 2 Hz. Tube heat unit limit exceeded. Allow cooling before next exposure.','note':'Do not override alarm.','fn':lambda: wav(am(960,2.0)+nz(0.01,sd=15))},
{'m':'xray','lbl':'alarm','mfr':'GE Healthcare','mdl':'Definium 6000','cmp':'Safety Interlock','op':'Radiation field outside detector','oc':'Collimation error detected','title':'X-Ray Radiation Field Error Alarm','interp':'Three-pulse 1100 Hz alarm at 0.5 Hz. Field not aligned with detector. Re-collimate.','note':'Safety-critical alarm. Do not expose until resolved.','fn':lambda: wav(si(1100,a=0.28)+am(1100,0.5,a=0.20)+nz(0.01,sd=16))},
{'m':'xray','lbl':'alarm','mfr':'Philips','mdl':'DigitalDiagnost C90','cmp':'AEC Sensor','op':'AEC backup timer alarm','oc':'Exposure exceeded 2000ms backup time','title':'X-Ray AEC Backup Timer Alarm','interp':'Continuous 800 Hz tone indicating AEC backup timer termination. Investigate AEC sensor.','note':'Reduce kV or reposition AEC sensor.','fn':lambda: wav(si(800,a=0.35)+nz(0.01,sd=17))},
{'m':'xray','lbl':'abnormal_vibration','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'Anode Bearing','op':'Anode rotation at 3600 RPM','oc':'Bearing dry after 8000h service','title':'X-Ray Anode Bearing Vibration Worn','interp':'60 Hz rumble with irregular 180 Hz sub-harmonics. Bearing wear. Remove from service for tube replacement.','note':'Tube is beyond recommended service life.','fn':lambda: wav(ha(180,n=3,dk=0.85)+si(60,a=0.22)+nz(0.07,sd=18))},
{'m':'xray','lbl':'abnormal_vibration','mfr':'GE Healthcare','mdl':'Definium 6000','cmp':'Generator Cabinet','op':'High-load fluoroscopy sequence','oc':'Loose cabinet panel','title':'X-Ray Generator Cabinet Panel Rattle','interp':'Irregular 35 Hz cabinet rattle during HV generator pulsing. Loose panel. Re-secure fasteners.','note':'Panel rattle can cause EMI.','fn':lambda: wav(si(35,a=0.28)+ha(140,n=2)+nz(0.05,sd=19))},
{'m':'xray','lbl':'unusual_noise','mfr':'Philips','mdl':'DigitalDiagnost C90','cmp':'HV Cable','op':'Routine PA chest','oc':'HV cable insulation cracked','title':'X-Ray HV Cable Arcing Sound','interp':'Crackling at 5 Hz during exposure. HV cable insulation breakdown. Stop use immediately. Replace cable.','note':'Arcing poses radiation and electrical safety risk.','fn':lambda: wav(ck(5.0,a=0.38)+nz(0.15,sd=20))},
{'m':'xray','lbl':'unusual_noise','mfr':'Canon Medical','mdl':'CXDI-810C','cmp':'Stator Winding','op':'Tube start sequence','oc':'Stator winding short-circuit suspected','title':'X-Ray Stator Winding Buzz Abnormal','interp':'Harsh 100 Hz buzz with broadband splatter during tube start. Electrical fault. Do not use. Contact service.','note':'Normal stator tone is clean sine.','fn':lambda: wav(ha(100,n=8,dk=0.95)+nz(0.18,sd=21))},
{'m':'xray','lbl':'verified_fault','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'X-Ray Tube','op':'Test exposure during PM','oc':'Confirmed tube failure filament open','title':'X-Ray Tube Filament Failure Confirmed','interp':'No anode rotation; only HV thump with no current. Open filament confirmed. Tube must be replaced.','note':'Confirmed filament open circuit.','fn':lambda: wav(ck(0.5,a=0.55)+nz(0.05,sd=22))},
{'m':'xray','lbl':'incorrect_setting','mfr':'GE Healthcare','mdl':'Definium 6000','cmp':'kV Selector','op':'Pediatric hand set to 120kV should be 55kV','oc':'Incorrect kV protocol selected','title':'X-Ray Incorrect kV Setting Warning Tone','interp':'Double-beep 700 Hz warning. Protocol kV mismatch detected. Verify and correct kV before exposing.','note':'System locks when kV outside protocol range by more than 20%.','fn':lambda: wav(am(700,1.5)+nz(0.02,sd=23))},
{'m':'xray','lbl':'fan_noise','mfr':'Philips','mdl':'DigitalDiagnost C90','cmp':'Console Cooling Fan','op':'Extended fluoroscopy session','oc':'Console fan filter blocked','title':'X-Ray Console Cooling Fan Blocked','interp':'Elevated 420 Hz fan whir with 110 Hz flutter. Blocked filter. Clean immediately to prevent overheating.','note':'Console temperature at 62 C.','fn':lambda: wav(ha(420,n=3,dk=0.58)+si(110,a=0.16)+nz(0.04,sd=24))},
{'m':'xray','lbl':'pump_irregularity','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'Anode Rotation Motor','op':'Tube preparation sequence','oc':'Motor driver fault slow ramp','title':'X-Ray Anode Rotation Motor Slow Ramp','interp':'Chirping 80-300 Hz sweep failing to reach rated speed. Motor driver fault. Abort exposure.','note':'Normal ramp reaches 3000 RPM in less than 0.8 s.','fn':lambda: wav(sw(80,300,d=2.0)+nz(0.04,sd=25))},
{'m':'xray','lbl':'normal_operation','mfr':'Canon Medical','mdl':'CXDI-810C','cmp':'Flat Panel Detector','op':'Detector offset calibration','oc':'Post-warmup auto-calibration','title':'X-Ray Flat Panel Detector Calibration Click','interp':'Periodic click at 2 Hz during flat-field calibration. Normal auto-calibration cycle.','note':'3-4 calibration frames acquired at startup.','fn':lambda: wav(ck(2.0,d=2.0,a=0.35)+nz(0.02,sd=26))},
{'m':'xray','lbl':'abnormal_vibration','mfr':'GE Healthcare','mdl':'Definium 6000','cmp':'Stand/Column','op':'Tube column vertical travel','oc':'Column guide rail not lubricated','title':'X-Ray Column Guide Rail Stick-Slip','interp':'Irregular 25 Hz juddering during column lift. Dry guide rail stick-slip. Lubricate rail immediately.','note':'Apply manufacturer-specified rail lubricant.','fn':lambda: wav(pulse(25,width=0.03,amp=0.42,d=2.0,sd=27)+nz(0.06,sd=28))},
{'m':'xray','lbl':'alarm','mfr':'Canon Medical','mdl':'CXDI-810C','cmp':'Detector Temperature Sensor','op':'Summer day no AC','oc':'Detector temperature above 40 C','title':'X-Ray Detector Overtemperature Alarm','interp':'Fast 1200 Hz pulsing at 3 Hz. Detector temperature exceeds operating range. Allow to cool.','note':'Imaging artifacts appear above 40 C.','fn':lambda: wav(am(1200,3.0)+nz(0.01,sd=29))},
{'m':'xray','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'HV Inverter','op':'Continuous fluoroscopy 70kV 1mA','oc':'Standard fluoroscopy protocol','title':'X-Ray HV Inverter Normal Fluoroscopy Hum','interp':'Continuous 250 Hz inverter switching tone during fluoroscopy. Normal for this generator.','note':'Tone amplitude proportional to mA output.','fn':lambda: wav(ha(250,n=5,dk=0.52)+nz(0.02,sd=30))},
{'m':'xray','lbl':'verified_fault','mfr':'Philips','mdl':'DigitalDiagnost C90','cmp':'Collimator Shutter Motor','op':'PM fault investigation','oc':'Shutter motor winding open confirmed','title':'X-Ray Collimator Shutter Motor Fault Confirmed','interp':'90 Hz buzzing with no movement. Winding open confirmed. Motor assembly must be replaced.','note':'Confirmed open winding measured at 0 A.','fn':lambda: wav(ha(90,n=6,dk=0.92)+nz(0.12,sd=31))},
{'m':'xray','lbl':'unusual_noise','mfr':'GE Healthcare','mdl':'Definium 6000','cmp':'Potter-Bucky Grid Motor','op':'Grid reciprocation during exposure','oc':'Grid motor bearing worn','title':'X-Ray Grid Motor Bearing Squeal','interp':'High-pitched 2800 Hz squeal at 8 Hz reciprocation rate. Grid motor bearing failure. Service required.','note':'Grid images showed motion blurring.','fn':lambda: wav(am(2800,8.0,a=0.30)+nz(0.04,sd=32))},
{'m':'xray','lbl':'incorrect_setting','mfr':'Canon Medical','mdl':'CXDI-810C','cmp':'mA Station','op':'Chest PA set to 500mA max 320mA','oc':'mA exceeds tube max','title':'X-Ray mA Overload Warning Tone','interp':'Sustained 650 Hz warning. mA setting exceeds tube maximum. Reduce mA before exposing.','note':'Exposure locked until mA corrected.','fn':lambda: wav(si(650,a=0.38)+nz(0.02,sd=33))},
{'m':'xray','lbl':'fan_noise','mfr':'Siemens Healthineers','mdl':'MULTIX Impact','cmp':'Inverter Cabinet Fan','op':'Sustained HV load','oc':'Fan bearing end-of-life','title':'X-Ray Inverter Cabinet Fan Bearing Wear','interp':'Rising 380 Hz fan tone with 45 Hz beat. Fan bearing wearing out. Schedule replacement at next PM.','note':'Fan bearing replacement is 30-min task.','fn':lambda: wav(ha(380,n=3,dk=0.60)+si(45,a=0.18)+nz(0.04,sd=34))},
{'m':'xray','lbl':'pump_irregularity','mfr':'Philips','mdl':'DigitalDiagnost C90','cmp':'Table Drive','op':'Table float/free mode travel','oc':'Table drive clutch slipping','title':'X-Ray Table Drive Clutch Slip','interp':'Intermittent 6 Hz slip-thud during table travel. Drive clutch slipping. Adjust or replace.','note':'Inconsistent positioning risks repeat exposures.','fn':lambda: wav(ck(6.0,d=2.0,a=0.38)+ha(160,n=2)+nz(0.05,sd=35))},

# CT SCAN 25
{'m':'ct','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Gantry Rotation Motor','op':'Scout scan 0.5 s/rotation','oc':'Idle gantry rotation test','title':'CT Gantry Rotation Normal Low Speed','interp':'Smooth 170 Hz electromagnetic hum during gantry rotation at 0.5 s/rot. Normal baseline.','note':'Compare at same rotation speed.','fn':lambda: wav(ha(170,n=4)+nz(0.02,sd=40))},
{'m':'ct','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'SOMATOM Force','cmp':'Slip Ring','op':'Full-speed scan 0.25 s/rotation','oc':'Routine abdominal CT','title':'CT Slip Ring Normal Contact Sound','interp':'Faint 340 Hz continuous electrical contact hum from slip ring. Normal for full-speed scanning.','note':'Amplitude should remain constant.','fn':lambda: wav(ha(340,n=3,dk=0.50)+nz(0.015,sd=41))},
{'m':'ct','lbl':'normal_operation','mfr':'Philips','mdl':'Incisive CT','cmp':'X-Ray Tube','op':'Helical thorax scan 120kV 250mA','oc':'Standard dose protocol','title':'CT X-Ray Tube Normal Continuous Emission','interp':'Steady 280 Hz tube emission tone during helical scan. Normal for this mA and speed.','note':'Tone slightly lower than full-body protocols.','fn':lambda: wav(ha(280,n=4,dk=0.55)+nz(0.025,sd=42))},
{'m':'ct','lbl':'normal_operation','mfr':'Canon Medical','mdl':'Aquilion ONE','cmp':'Patient Table Drive','op':'Table advance during scan','oc':'Head-to-pelvis exam','title':'CT Table Drive Motor Normal Advance','interp':'Steady 190 Hz table drive hum during scan advance. Speed proportional to pitch. Normal.','note':'Verify table speed matches protocol pitch setting.','fn':lambda: wav(ha(190,n=3,dk=0.60)+nz(0.02,sd=43))},
{'m':'ct','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Cooling System','op':'Post-scan tube cooling','oc':'After 10 consecutive passes','title':'CT Tube Cooling System Normal Operation','interp':'400 Hz oil pump hum with 3 Hz circulation pulse. Normal thermal management post-scan.','note':'Allow full cooling cycle before repeat.','fn':lambda: wav(am(400,3.0)+nz(0.03,sd=44))},
{'m':'ct','lbl':'alarm','mfr':'Siemens Healthineers','mdl':'SOMATOM Force','cmp':'Gantry Safety','op':'Patient positioned mid-scan','oc':'Emergency stop pressed','title':'CT Emergency Stop Alarm','interp':'Sustained 1000 Hz alarm following emergency stop. Scan aborted. Verify patient safety before resetting.','note':'Must be physically reset after investigation.','fn':lambda: wav(si(1000,a=0.42)+nz(0.01,sd=45))},
{'m':'ct','lbl':'alarm','mfr':'Philips','mdl':'Incisive CT','cmp':'Tube Heat Monitor','op':'Back-to-back trauma scans','oc':'Tube heat exceeds 90 percent capacity','title':'CT Tube Heat Capacity Alarm','interp':'Intermittent 880 Hz dual-tone at 1.5 Hz. Tube HU above 90 percent. Mandatory cooling delay. Do not override.','note':'Override risks tube rupture.','fn':lambda: wav(am(880,1.5)+nz(0.01,sd=46))},
{'m':'ct','lbl':'alarm','mfr':'Canon Medical','mdl':'Aquilion ONE','cmp':'Contrast Injector Interface','op':'IV contrast injection','oc':'Injector connection fault','title':'CT Contrast Injector Communication Alarm','interp':'Three-beep 950 Hz every 3 s. Injector communication lost. Check cable and power before scanning with contrast.','note':'Scan without contrast possible but compromises diagnostic intent.','fn':lambda: wav(si(950,a=0.25)+ck(0.33,d=2.0,a=0.20)+nz(0.01,sd=47))},
{'m':'ct','lbl':'abnormal_vibration','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Gantry Bearing','op':'High-speed scan 0.28 s/rotation','oc':'Bearing worn after 5 years','title':'CT Gantry Bearing Vibration Worn','interp':'50 Hz whole-gantry vibration with 150 Hz harmonic. Bearing wear. Schedule urgent bearing replacement.','note':'Image ring artefact likely. Check reconstructions.','fn':lambda: wav(ha(150,n=3,dk=0.82)+si(50,a=0.24)+nz(0.08,sd=48))},
{'m':'ct','lbl':'abnormal_vibration','mfr':'Siemens Healthineers','mdl':'SOMATOM Force','cmp':'Detector Array Mount','op':'Standard scan','oc':'Detector mounting screw loose','title':'CT Detector Mount Vibration','interp':'8 Hz periodic clunk coinciding with gantry rotation. Loose detector mount. Halt scanning; tighten mount.','note':'Ring artefacts visible if detector rattles.','fn':lambda: wav(ck(8.0,d=2.0,a=0.36)+nz(0.07,sd=49))},
{'m':'ct','lbl':'unusual_noise','mfr':'Philips','mdl':'Incisive CT','cmp':'Slip Ring Brush','op':'Full-speed helical scan','oc':'Carbon brush heavily worn','title':'CT Slip Ring Carbon Brush Sparking','interp':'Crackling 12 Hz irregular spark from slip ring area. Carbon brush near end of life. Stop scanning; replace brush assembly.','note':'Sparking can corrupt scan data.','fn':lambda: wav(ck(12.0,d=2.0,a=0.40)+nz(0.15,sd=50))},
{'m':'ct','lbl':'unusual_noise','mfr':'Canon Medical','mdl':'Aquilion ONE','cmp':'High-Voltage Tank','op':'Pre-scan tube conditioning','oc':'HV insulating oil contaminated','title':'CT HV Tank Insulation Breakdown Sound','interp':'Low crackling 4 Hz discharge in HV tank during conditioning. Oil contamination suspected. Remove from service.','note':'Insulation failure risk.','fn':lambda: wav(ck(4.0,d=2.0,a=0.44)+nz(0.18,sd=51))},
{'m':'ct','lbl':'verified_fault','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Gantry Rotation Motor','op':'PM fault investigation','oc':'Motor phase winding open confirmed','title':'CT Gantry Motor Phase Fault Confirmed','interp':'Single-phase 170 Hz hum at half amplitude with 85 Hz sub-harmonic. Phase winding open. Motor must be replaced.','note':'Confirmed by electrical measurement.','fn':lambda: wav(ha(85,n=4,dk=0.90)+ha(170,n=2,dk=0.50)*0.5+nz(0.10,sd=52))},
{'m':'ct','lbl':'verified_fault','mfr':'Siemens Healthineers','mdl':'SOMATOM Force','cmp':'X-Ray Tube','op':'Test scan during PM','oc':'Tube vacuum loss confirmed','title':'CT Tube Vacuum Loss Confirmed Fault','interp':'Erratic 600 Hz tube tone with arcing transients. Vacuum loss confirmed. Tube must be replaced before any scan.','note':'Vacuum loss causes uncontrolled electron scatter.','fn':lambda: wav(ha(600,n=3,dk=0.70)+ck(6.0,d=2.0,a=0.25)+nz(0.09,sd=53))},
{'m':'ct','lbl':'incorrect_setting','mfr':'Philips','mdl':'Incisive CT','cmp':'Rotation Speed','op':'Cardiac CT set to 1.0 s/rot should be 0.25','oc':'Wrong protocol selected','title':'CT Incorrect Rotation Speed Warning','interp':'Double 750 Hz beep on initiation. Rotation speed incompatible with cardiac gate protocol. Select correct protocol.','note':'Cardiac protocols require 0.25-0.35 s/rotation.','fn':lambda: wav(am(750,2.0)+nz(0.02,sd=54))},
{'m':'ct','lbl':'incorrect_setting','mfr':'Canon Medical','mdl':'Aquilion ONE','cmp':'Pitch Setting','op':'Chest CT pitch 2.0 max 1.5','oc':'Protocol pitch limit exceeded','title':'CT Pitch Limit Warning Tone','interp':'Sustained 680 Hz tone with intermittent break. Table pitch exceeds protocol limit. Reduce pitch.','note':'High pitch causes under-sampling and streak artefacts.','fn':lambda: wav(am(680,0.8)+nz(0.02,sd=55))},
{'m':'ct','lbl':'fan_noise','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Electronics Bay Fan','op':'Extended scan session over 4 hours','oc':'Fan filter clogged','title':'CT Electronics Bay Cooling Fan Overload','interp':'450 Hz fan 10 dB above baseline with 120 Hz chop. Filter clogged. Clean immediately.','note':'Bay temperature at 68 C limit 55 C.','fn':lambda: wav(ha(450,n=3,dk=0.58)+si(120,a=0.20)+nz(0.05,sd=56))},
{'m':'ct','lbl':'fan_noise','mfr':'Siemens Healthineers','mdl':'SOMATOM Force','cmp':'Tube Cooling Fan','op':'Post-trauma scan session','oc':'Fan blade chipped','title':'CT Tube Cooling Fan Blade Chip','interp':'370 Hz fan tone with 11 Hz impact vibration from chipped blade. Fan imbalance. Replace fan assembly.','note':'Chipped blade reduces cooling efficiency by 15 percent.','fn':lambda: wav(ha(370,n=3,dk=0.60)+ck(11.0,d=2.0,a=0.22)+nz(0.04,sd=57))},
{'m':'ct','lbl':'pump_irregularity','mfr':'Philips','mdl':'Incisive CT','cmp':'Oil Cooling Pump','op':'Long scan session','oc':'Pump cavitation due to low oil level','title':'CT Oil Cooling Pump Cavitation','interp':'Irregular 3 Hz gurgling with 220 Hz pump tone. Oil level low causing cavitation. Top up oil immediately.','note':'Cavitation causes premature tube failure.','fn':lambda: wav(am(220,3.0)+ck(3.0,d=2.0,a=0.28)+nz(0.08,sd=58))},
{'m':'ct','lbl':'pump_irregularity','mfr':'Canon Medical','mdl':'Aquilion ONE','cmp':'Chiller Pump','op':'Continuous scan session summer','oc':'Chiller pump inlet blocked','title':'CT Chiller Pump Inlet Blockage','interp':'250 Hz pump hum with 5 Hz pressure surge. Inlet filter blocked. Clear filter; check water temperature.','note':'Water temperature rose from 20 C to 28 C.','fn':lambda: wav(ha(250,n=3)+ck(5.0,d=2.0,a=0.24)+nz(0.07,sd=59))},
{'m':'ct','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Table Lock','op':'Table lock engagement','oc':'End of scan positioning','title':'CT Table Lock Normal Click','interp':'Single mechanical click when table locks at isocenter. Normal end-of-travel lock engagement.','note':'Double-click indicates latch not fully seating.','fn':lambda: wav(ck(0.8,d=2.0,a=0.48)+nz(0.01,sd=60))},
{'m':'ct','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'SOMATOM Force','cmp':'Dose Modulation System','op':'Angular dose modulation active','oc':'Routine chest CT','title':'CT Dose Modulation mA Variation Normal','interp':'170 Hz tone amplitude variation at 2 Hz from angular mA modulation. Normal automated dose modulation.','note':'mA drops during AP views and increases for lateral.','fn':lambda: wav(am(170,2.0,a=0.38)+nz(0.02,sd=61))},
{'m':'ct','lbl':'normal_operation','mfr':'Philips','mdl':'Incisive CT','cmp':'Reconstruction Engine','op':'Real-time reconstruction 0.5mm slices','oc':'Post-scan processing','title':'CT Reconstruction System Fan Normal','interp':'Steady 330 Hz GPU cooling fan during real-time reconstruction. Normal compute load.','note':'Fan speed increases with slice count.','fn':lambda: wav(ha(330,n=3,dk=0.54)+nz(0.02,sd=62))},
{'m':'ct','lbl':'abnormal_vibration','mfr':'Canon Medical','mdl':'Aquilion ONE','cmp':'Table Support Column','op':'Table extended at maximum reach','oc':'Column pivot bearing worn','title':'CT Table Column Pivot Bearing Vibration','interp':'30 Hz low-frequency table oscillation at maximum extension. Pivot bearing worn. Restrict table extension.','note':'Table wobble causes motion artefacts.','fn':lambda: wav(si(30,a=0.26)+ha(120,n=2)+nz(0.07,sd=63))},
{'m':'ct','lbl':'alarm','mfr':'GE Healthcare','mdl':'Revolution Apex','cmp':'Laser Localizer','op':'Laser localizer lamp failure','oc':'Lamp burnt out','title':'CT Laser Localizer Lamp Failure Alarm','interp':'Single 500 Hz beep every 5 s. Laser lamp failed. Replace lamp; use external alignment aid.','note':'Patient positioning accuracy reduced.','fn':lambda: wav(ck(0.2,d=2.0,a=0.32)+si(500,a=0.22)+nz(0.01,sd=64))},

# MRI 25
{'m':'mri','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'MAGNETOM Prisma','cmp':'Gradient Coil','op':'T2-weighted brain sequence','oc':'Standard 3T protocol','title':'MRI Gradient Coil Normal T2 Sequence Banging','interp':'Regular 600 Hz electromagnetic knocking at 4 Hz gradient switching rate. Normal gradient coil vibration.','note':'Hearing protection mandatory.','fn':lambda: wav(ck(4.0,d=2.0,a=0.44)+ha(600,n=2,dk=0.40)+nz(0.03,sd=70))},
{'m':'mri','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Cryocooler','op':'Steady-state superconducting magnet cooling','oc':'Field stable at 3T','title':'MRI Cryocooler Normal Operation','interp':'Rhythmic 1.4 Hz helium compression cycle with 80 Hz motor hum. Normal cryocooler operation.','note':'Cycle rate varies plus or minus 0.1 Hz with ambient temperature.','fn':lambda: wav(am(80,1.4)+nz(0.025,sd=71))},
{'m':'mri','lbl':'normal_operation','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'RF Amplifier','op':'SE sequence transmission','oc':'Routine brain imaging','title':'MRI RF Amplifier Normal Transmission Hum','interp':'140 Hz steady RF amplifier cooling fan tone during RF transmission. Normal operation.','note':'Tone rises slightly during high flip-angle sequences.','fn':lambda: wav(ha(140,n=4,dk=0.58)+nz(0.02,sd=72))},
{'m':'mri','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'MAGNETOM Vida','cmp':'Patient Table Drive','op':'Bore insertion/retraction','oc':'Patient positioning','title':'MRI Patient Table Motor Normal Insertion','interp':'Smooth 160 Hz table drive during bore insertion. Normal. Speed should be constant.','note':'Jerky movement indicates table drive clutch wear.','fn':lambda: wav(ha(160,n=3,dk=0.62)+nz(0.02,sd=73))},
{'m':'mri','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Active Shielding Coil','op':'Shimming sequence','oc':'Pre-scan auto-shim','title':'MRI Auto-Shim Gradient Pulses Normal','interp':'Short 20 Hz burst of gradient tones during automated shimming. Normal pre-scan calibration.','note':'Shimming completes in less than 30 s.','fn':lambda: wav(sw(200,800,d=2.0)*0.5+nz(0.03,sd=74))},
{'m':'mri','lbl':'alarm','mfr':'Siemens Healthineers','mdl':'MAGNETOM Prisma','cmp':'Cryogen Level Sensor','op':'Routine scan','oc':'Liquid helium below 30 percent','title':'MRI Low Helium Level Alarm','interp':'Intermittent 900 Hz two-tone alarm at 0.5 Hz. Helium level critical. Schedule emergency refill within 48 h.','note':'Contact cryogen supplier immediately.','fn':lambda: wav(am(900,0.5)+nz(0.01,sd=75))},
{'m':'mri','lbl':'alarm','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Quench Pipe Sensor','op':'Sudden field collapse quench','oc':'Unexpected quench event','title':'MRI Magnet Quench Alert Alarm','interp':'Continuous loud 1100 Hz alarm with 4 Hz modulation. Magnet quenching. Evacuate immediately.','note':'Oxygen displacement hazard.','fn':lambda: wav(am(1100,4.0,a=0.45)+nz(0.02,sd=76))},
{'m':'mri','lbl':'alarm','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'Patient Intercom','op':'Patient in bore during scan','oc':'Patient pressed emergency squeeze ball','title':'MRI Patient Emergency Squeeze Ball Alarm','interp':'Rapid 700 Hz alert at 2.5 Hz. Patient activated emergency signal. Stop scan immediately.','note':'Always acknowledge before resuming.','fn':lambda: wav(am(700,2.5)+nz(0.01,sd=77))},
{'m':'mri','lbl':'abnormal_vibration','mfr':'Siemens Healthineers','mdl':'MAGNETOM Vida','cmp':'Gradient Coil Former','op':'High-gradient EPI sequence','oc':'Acoustic resonance in bore','title':'MRI Gradient Coil Former Resonance','interp':'Intense 500 Hz resonant drone during EPI, 15 dB above normal. Reduce gradient slew rate.','note':'Resonance can exceed IEC acoustic safety limit.','fn':lambda: wav(ha(500,n=5,dk=0.88)+si(500,a=0.20)+nz(0.05,sd=78))},
{'m':'mri','lbl':'abnormal_vibration','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Cryocooler Compressor','op':'Scheduled cryocooler maintenance','oc':'Compressor valve worn','title':'MRI Cryocooler Compressor Valve Rattle','interp':'Irregular 1.4 Hz cycle with additional 22 Hz mechanical rattle. Compressor valve degraded. Schedule service.','note':'Helium boil-off may increase.','fn':lambda: wav(am(80,1.4)+si(22,a=0.24)+nz(0.07,sd=79))},
{'m':'mri','lbl':'unusual_noise','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'Gradient Amplifier','op':'Standard scan','oc':'Amplifier output transistor arcing','title':'MRI Gradient Amplifier Output Arcing','interp':'Irregular crackling at 7 Hz during gradient switching. Output stage arcing suspected. Abort scan immediately.','note':'Arcing can destroy gradient amplifier.','fn':lambda: wav(ck(7.0,d=2.0,a=0.42)+nz(0.16,sd=80))},
{'m':'mri','lbl':'unusual_noise','mfr':'Siemens Healthineers','mdl':'MAGNETOM Prisma','cmp':'RF Coil Head','op':'RF calibration pulse','oc':'Coil element detuning mismatch','title':'MRI Head Coil Element Mismatch Buzz','interp':'Harsh 200 Hz buzz during RF transmission. Coil element tune/detune mismatch. Replace head coil.','note':'Mismatch causes local SAR hotspot.','fn':lambda: wav(ha(200,n=7,dk=0.93)+nz(0.14,sd=81))},
{'m':'mri','lbl':'verified_fault','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Gradient Coil X-Axis','op':'PM fault test','oc':'X-gradient amplifier power stage failed','title':'MRI X-Gradient Amplifier Stage Failure Confirmed','interp':'No X-gradient sound; Y and Z channels normal. X-channel missing confirmed. Images show shearing artefact.','note':'Confirmed by service engineer.','fn':lambda: wav(ck(4.0,d=2.0,a=0.22)+nz(0.12,sd=82))},
{'m':'mri','lbl':'verified_fault','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'Passive Shimming Plate','op':'Routine scan','oc':'Shimming plate displaced field homogeneity lost','title':'MRI Shim Plate Displacement Confirmed Fault','interp':'Broadband gradient noise without clear tonal structure; auto-shim fails. Shim plate displaced. Realignment required.','note':'Images show severe susceptibility artefact.','fn':lambda: wav(nz(0.30,sd=83)+sw(100,900,d=2.0)*0.25)},
{'m':'mri','lbl':'incorrect_setting','mfr':'Siemens Healthineers','mdl':'MAGNETOM Vida','cmp':'SAR Monitor','op':'High flip-angle cardiac sequence','oc':'SAR level 2 exceeded','title':'MRI SAR Level 2 Warning','interp':'Continuous 850 Hz warning with 3 Hz pulsing. SAR exceeds IEC level 2 limit. Reduce flip angle immediately.','note':'Level 2 operation requires supervised mode.','fn':lambda: wav(am(850,3.0)+nz(0.01,sd=84))},
{'m':'mri','lbl':'incorrect_setting','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Slew Rate','op':'DWI sequence exceeding PNS limit','oc':'Peripheral nerve stimulation threshold exceeded','title':'MRI PNS Threshold Warning Tone','interp':'Single 600 Hz beep every 2 s. Gradient slew rate exceeds PNS threshold. Reduce slew rate.','note':'Patient may report tingling.','fn':lambda: wav(si(600,a=0.32)+ck(0.5,d=2.0,a=0.18)+nz(0.02,sd=85))},
{'m':'mri','lbl':'fan_noise','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'Gradient Amplifier Rack Fan','op':'Long scan session 3 hours','oc':'Fan filter partially blocked','title':'MRI Gradient Amp Rack Fan Partial Blockage','interp':'390 Hz fan elevated 8 dB with 100 Hz harmonic rumble. Rack fan filter partially blocked. Clean filter.','note':'Amplifier inlet temperature at 52 C limit 45 C.','fn':lambda: wav(ha(390,n=3,dk=0.60)+si(100,a=0.18)+nz(0.04,sd=86))},
{'m':'mri','lbl':'fan_noise','mfr':'Siemens Healthineers','mdl':'MAGNETOM Prisma','cmp':'Computer Room AC','op':'Summer peak load','oc':'AC unit refrigerant low','title':'MRI Computer Room AC Refrigerant Low','interp':'350 Hz compressor hum with erratic 18 Hz hunting cycle. Refrigerant level low. Service AC unit.','note':'Computer room at 28 C max 22 C.','fn':lambda: wav(ha(350,n=3,dk=0.62)+si(18,a=0.22)+nz(0.05,sd=87))},
{'m':'mri','lbl':'pump_irregularity','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Cryocooler Coldhead Pump','op':'Cryocooler operation','oc':'Coldhead helium circuit leak','title':'MRI Cryocooler Coldhead Helium Leak','interp':'Irregular 1.4 Hz cycle with longer compression phase and 2800 Hz whistle. Helium circuit leak. Emergency service required.','note':'Helium boil-off rate doubled.','fn':lambda: wav(am(80,1.2)+si(2800,a=0.20)+nz(0.08,sd=88))},
{'m':'mri','lbl':'pump_irregularity','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'Water Cooling Pump','op':'Extended scan day','oc':'Pump impeller cavitation','title':'MRI Water Cooling Pump Cavitation','interp':'260 Hz pump hum with irregular 6 Hz cavitation bursts. Water cooling cavitation. Check water pressure.','note':'Cavitation reduces cooling effectiveness.','fn':lambda: wav(ha(260,n=3)+ck(6.0,d=2.0,a=0.26)+nz(0.08,sd=89))},
{'m':'mri','lbl':'normal_operation','mfr':'Siemens Healthineers','mdl':'MAGNETOM Vida','cmp':'Gradient Coil','op':'DWI sequence standard b-values','oc':'Routine brain DWI','title':'MRI Gradient Coil Normal DWI Banging Pattern','interp':'High-amplitude 8 Hz gradient knocking pattern with 400 Hz resonance. Normal DWI gradient signature.','note':'Louder than T2 sequences due to high-b diffusion gradients.','fn':lambda: wav(ck(8.0,d=2.0,a=0.48)+ha(400,n=2,dk=0.45)+nz(0.03,sd=90))},
{'m':'mri','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'SIGNA Pioneer','cmp':'Field Lock System','op':'Field drift correction','oc':'Post-shim field stabilisation','title':'MRI Field Lock Gradient Correction Normal','interp':'Short 2 Hz gradient pulse burst during field lock correction. Automatic B0 stabilisation. Normal.','note':'Correction pulses should occur less than twice per minute.','fn':lambda: wav(ck(2.0,d=2.0,a=0.28)+nz(0.02,sd=91))},
{'m':'mri','lbl':'normal_operation','mfr':'Philips','mdl':'Ingenia Elition 3T','cmp':'Gradient Power Supply','op':'Pre-scan gradient test','oc':'Routine startup sequence','title':'MRI Gradient Power Supply Startup Test','interp':'Short chirp 200-1000 Hz sweep during gradient self-test. Normal system self-check.','note':'Self-test completes in less than 5 s.','fn':lambda: wav(sw(200,1000,d=2.0)+nz(0.02,sd=92))},
{'m':'mri','lbl':'abnormal_vibration','mfr':'Siemens Healthineers','mdl':'MAGNETOM Prisma','cmp':'Magnet Cryostat','op':'EPI sequence','oc':'Acoustic shield delamination','title':'MRI Cryostat Acoustic Shield Delamination','interp':'Irregular 550 Hz buzz with structural resonance at 18 Hz during EPI. Shield delamination. Reduce gradient duty cycle.','note':'Delamination worsens over time.','fn':lambda: wav(ha(550,n=4,dk=0.80)+si(18,a=0.22)+nz(0.07,sd=93))},
{'m':'mri','lbl':'alarm','mfr':'Siemens Healthineers','mdl':'MAGNETOM Vida','cmp':'Oxygen Monitor','op':'Normal scan session','oc':'O2 sensor low in magnet room','title':'MRI Oxygen Depletion Alarm','interp':'Loud 1300 Hz alarm with 2 Hz modulation. Oxygen below 19.5 percent. Evacuate immediately.','note':'Helium displacement can cause asphyxiation.','fn':lambda: wav(am(1300,2.0,a=0.50)+nz(0.01,sd=94))},

# ECG 25
{'m':'ecg','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Thermal Printer','op':'Standard 12-lead ECG print','oc':'A4 paper roll loaded','title':'ECG Thermal Printer Normal Operation','interp':'Smooth 200 Hz stepper motor hum during ECG printout. Normal print operation.','note':'Speed varies with paper feed rate setting.','fn':lambda: wav(ha(200,n=4,dk=0.60)+nz(0.02,sd=100))},
{'m':'ecg','lbl':'normal_operation','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Beeper','op':'Normal sinus rhythm detection','oc':'NSR at 72 bpm','title':'ECG Normal Sinus Rhythm QRS Beep','interp':'Regular 1.2 Hz QRS detection beep at 440 Hz. Normal sinus rhythm at 72 bpm.','note':'Rate matches HR. Irregular beep indicates arrhythmia.','fn':lambda: wav(ck(1.2,d=2.0,a=0.35)+si(440,a=0.10)+nz(0.01,sd=101))},
{'m':'ecg','lbl':'normal_operation','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Paper Feed Motor','op':'Continuous rhythm strip','oc':'25 mm/s paper speed','title':'ECG Paper Feed Motor Normal 25 mm per s','interp':'Steady 150 Hz paper feed stepper at 25 mm/s. Normal rhythm strip recording.','note':'Higher paper speed produces higher-pitched motor tone.','fn':lambda: wav(ha(150,n=5,dk=0.62)+nz(0.02,sd=102))},
{'m':'ecg','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Internal Clock','op':'Real-time monitoring mode','oc':'Monitoring post-MI patient','title':'ECG Normal Monitoring Baseline Tone','interp':'Very faint 50 Hz power-line filter reference hum with clean baseline. Normal monitoring baseline.','note':'Additional tonal components indicate lead-off or interference.','fn':lambda: wav(si(50,a=0.06)+nz(0.04,sd=103))},
{'m':'ecg','lbl':'normal_operation','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Stylus Assembly','op':'Printing STEMI alert trace','oc':'Priority print mode','title':'ECG Priority Print Stylus Hum','interp':'Short 350 Hz stylus drive hum during priority STEMI print. Faster speed than routine print. Normal.','note':'Priority print completes in less than 4 s vs 8 s standard.','fn':lambda: wav(ha(350,n=3,dk=0.58)+nz(0.02,sd=104))},
{'m':'ecg','lbl':'alarm','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Alarm Speaker','op':'VF detected','oc':'Patient in ventricular fibrillation','title':'ECG Ventricular Fibrillation Alarm','interp':'Rapid continuous 1000 Hz two-tone alarm at 5 Hz. VF detected. Initiate resuscitation protocol immediately.','note':'Highest priority alarm. Do not silence without patient assessment.','fn':lambda: wav(am(1000,5.0,a=0.45)+nz(0.01,sd=105))},
{'m':'ecg','lbl':'alarm','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Lead-Off Sensor','op':'Monitoring lead detached','oc':'V4 electrode fell off patient','title':'ECG Lead-Off Alarm','interp':'Intermittent 750 Hz beep at 1 Hz. Lead-off condition detected V4. Reattach electrode.','note':'Lead-off alarms should be resolved before relying on readings.','fn':lambda: wav(am(750,1.0)+nz(0.01,sd=106))},
{'m':'ecg','lbl':'alarm','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Arrhythmia Detector','op':'Patient monitoring','oc':'Asystole detected','title':'ECG Asystole Alarm','interp':'Continuous 1200 Hz sustained alarm with 2 Hz modulation. Asystole detected. Verify leads and patient status.','note':'Always rule out artefact before CPR.','fn':lambda: wav(am(1200,2.0,a=0.50)+nz(0.01,sd=107))},
{'m':'ecg','lbl':'alarm','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Battery Monitor','op':'Cordless monitoring','oc':'Battery below 10 percent','title':'ECG Low Battery Alarm','interp':'Single 600 Hz beep. Battery critical. Connect mains power immediately or transfer monitoring.','note':'Machine shuts down in less than 5 min at this battery level.','fn':lambda: wav(si(600,a=0.30)+nz(0.01,sd=108))},
{'m':'ecg','lbl':'abnormal_vibration','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Thermal Printer Motor','op':'Routine ECG print','oc':'Paper advance gear stripped','title':'ECG Thermal Printer Gear Slip','interp':'Irregular 5 Hz slip-clunk during paper advance. Gear tooth stripped. Service printer.','note':'Stripped gear produces blank sections in printout.','fn':lambda: wav(ck(5.0,d=2.0,a=0.38)+ha(200,n=2)+nz(0.06,sd=109))},
{'m':'ecg','lbl':'abnormal_vibration','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Stylus Drive','op':'High-speed print 50 mm/s','oc':'Stylus carriage bearing worn','title':'ECG Stylus Carriage Bearing Vibration','interp':'25 Hz lateral vibration during high-speed print. Stylus carriage bearing worn. Service before next use.','note':'Wavy trace lines visible on printout.','fn':lambda: wav(si(25,a=0.24)+ha(300,n=2)+nz(0.07,sd=110))},
{'m':'ecg','lbl':'unusual_noise','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Cable Lead Set','op':'12-lead acquisition','oc':'Broken inner conductor in V3 lead','title':'ECG Broken Lead Wire Intermittent Noise','interp':'Crackling 8 Hz intermittent noise during signal acquisition. Broken inner conductor. Replace lead set immediately.','note':'Broken lead produces artefact that can mimic arrhythmia.','fn':lambda: wav(ck(8.0,d=2.0,a=0.36)+nz(0.14,sd=111))},
{'m':'ecg','lbl':'unusual_noise','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Patient Interface','op':'Routine 12-lead','oc':'Electrode gel dried on skin','title':'ECG Dry Electrode Contact Noise','interp':'High-pitched 3200 Hz intermittent squeal from high-impedance electrode. Gel dried. Replace electrode and re-gel.','note':'High skin impedance causes artefacts.','fn':lambda: wav(am(3200,4.0,a=0.25)+nz(0.12,sd=112))},
{'m':'ecg','lbl':'verified_fault','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Thermal Printer Head','op':'PM fault test','oc':'Thermal element bank failure confirmed','title':'ECG Thermal Printer Head Element Failure Confirmed','interp':'Irregular 200 Hz motor hum with 3 Hz skip pattern. Thermal element row missing. Replace print head assembly.','note':'Confirmed by test print: 2 mm blank stripe throughout strip.','fn':lambda: wav(ha(200,n=4,dk=0.60)+ck(3.0,d=2.0,a=0.20)+nz(0.07,sd=113))},
{'m':'ecg','lbl':'verified_fault','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'ADC Board','op':'PM electrical test','oc':'ADC channel 3 offset confirmed failed','title':'ECG ADC Channel Fault Confirmed','interp':'Continuous 60 Hz hum on leads I II aVR only. ADC channel 3 DC offset confirmed. Board must be replaced.','note':'Affected leads show flat-line or saturated output.','fn':lambda: wav(ha(60,n=6,dk=0.95)+nz(0.10,sd=114))},
{'m':'ecg','lbl':'incorrect_setting','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Filter Setting','op':'Recording with muscle artifact filter off','oc':'Filter setting reset to off','title':'ECG Filter-Off EMG Artifact Noise','interp':'High-frequency 250 Hz broadband noise on all leads. Muscle artifact filter turned off. Re-enable EMG filter.','note':'Filter-off produces spurious high-frequency components.','fn':lambda: wav(nz(0.30,sd=115)+ha(250,n=6,dk=0.90)*0.25)},
{'m':'ecg','lbl':'incorrect_setting','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Paper Speed','op':'ECG at 10 mm/s should be 25','oc':'Wrong paper speed selected','title':'ECG Wrong Paper Speed Warning Tone','interp':'Single 500 Hz warning beep when paper speed below protocol minimum. Change paper speed to 25 mm/s.','note':'10 mm/s compresses waveform.','fn':lambda: wav(si(500,a=0.32)+nz(0.01,sd=116))},
{'m':'ecg','lbl':'fan_noise','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Internal Fan','op':'Extended monitoring session 12 hours','oc':'Fan filter lint-clogged','title':'ECG Internal Fan Lint Blockage','interp':'280 Hz fan with elevated amplitude and 70 Hz flutter. Lint accumulation. Clean fan filter immediately.','note':'Temperature sensor at 55 C limit 45 C.','fn':lambda: wav(ha(280,n=3,dk=0.62)+si(70,a=0.18)+nz(0.04,sd=117))},
{'m':'ecg','lbl':'pump_irregularity','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Paper Roll Tension Clutch','op':'Near end-of-roll printing','oc':'Tension clutch slipping on near-empty roll','title':'ECG Paper Tension Clutch Slip','interp':'4 Hz irregular slip-click during printing near end of roll. Tension clutch slipping. Replace paper roll.','note':'Slip causes paper jam risk.','fn':lambda: wav(ck(4.0,d=2.0,a=0.34)+ha(200,n=2)+nz(0.05,sd=118))},
{'m':'ecg','lbl':'normal_operation','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Touch Screen','op':'Parameter entry','oc':'Normal operation','title':'ECG Touch Screen Key Tone Normal','interp':'Short 880 Hz key click on each touch screen input. Normal UI feedback.','note':'Can be disabled in settings.','fn':lambda: wav(ck(3.0,d=2.0,a=0.30)+si(880,a=0.10)+nz(0.01,sd=119))},
{'m':'ecg','lbl':'normal_operation','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Charge Indicator','op':'Charging from mains','oc':'Post-use battery recharge','title':'ECG Battery Charging Chirp Normal','interp':'Periodic 0.25 Hz 2000 Hz chirp during fast charge cycle. Normal battery management pulse.','note':'Chirp rate slows as battery approaches full charge.','fn':lambda: wav(am(2000,0.25)+nz(0.01,sd=120))},
{'m':'ecg','lbl':'alarm','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'ST Analysis Module','op':'Monitoring post-PTCA','oc':'New ST elevation detected','title':'ECG ST Elevation Alert','interp':'Urgent 1050 Hz three-beep alarm. New ST elevation detected V2-V4. Notify physician immediately.','note':'Obtain 12-lead ECG and clinical assessment immediately.','fn':lambda: wav(si(1050,a=0.30)+ck(3.0,d=2.0,a=0.25)+nz(0.01,sd=121))},
{'m':'ecg','lbl':'abnormal_vibration','mfr':'Philips','mdl':'PageWriter TC70','cmp':'Paper Cutter Blade','op':'Auto-cut after each report','oc':'Cutter blade spring worn','title':'ECG Paper Cutter Spring Vibration','interp':'10 Hz vibration burst after each cut. Cutter blade return spring weakened. Replace cutter assembly.','note':'Incomplete cuts cause paper jam risk.','fn':lambda: wav(ck(10.0,d=2.0,a=0.36)+nz(0.07,sd=122))},
{'m':'ecg','lbl':'unusual_noise','mfr':'Mindray','mdl':'BeneHeart R12','cmp':'Mains Power Filter','op':'Plugged into poorly earthed outlet','oc':'60 Hz power line interference','title':'ECG Power-Line Interference Hum','interp':'Strong 60 Hz hum on all leads from poor earthing. Move to earthed outlet or use isolation transformer.','note':'60 Hz notch filter may reduce but not eliminate artefact.','fn':lambda: wav(ha(60,n=5,dk=0.90)+nz(0.08,sd=123))},
{'m':'ecg','lbl':'normal_operation','mfr':'GE Healthcare','mdl':'MAC 5500 HD','cmp':'Screen Backlight','op':'Low-light cardiac lab use','oc':'Nighttime monitoring','title':'ECG Screen Backlight Inverter Normal','interp':'Very faint 440 Hz screen inverter tone in quiet environment. Normal; inaudible in clinical environments.','note':'Not a fault. Consider OLED revision if noise is concern.','fn':lambda: wav(si(440,a=0.06)+nz(0.04,sd=124))},
]

def sess(account):
    for attempt in range(5):
        try:
            s = requests.Session()
            r = s.post(BASE + '/auth/login', json=account, timeout=10)
            r.raise_for_status()
            return s
        except Exception:
            if attempt == 4:
                raise
            time.sleep(1.0 * (attempt + 1))

_sa = None
_sb = None

def get_sa(force_refresh=False):
    global _sa
    if _sa is None or force_refresh:
        _sa = sess(EA)
    return _sa

def get_sb(force_refresh=False):
    global _sb
    if _sb is None or force_refresh:
        _sb = sess(EB)
    return _sb

def csrf(s):
    return s.get(BASE + '/auth/csrf', timeout=10).json()['csrf_token']

def get_vid(s):
    r = s.get(BASE + '/knowledge?status=published&page_size=5', timeout=10)
    items = [i for i in r.json().get('items', []) if i.get('version_status') == 'published']
    if items:
        print(f"  Source: {items[0]['title'][:60]}")
        return items[0]['version_id']
    raise RuntimeError('No published knowledge source found.')

def seed(entry, vid, existing_titles):
    if entry['title'] in existing_titles:
        return 'SKIP'

    try:
        audio = entry['fn']()
    except Exception as e:
        print(f'  x Audio gen: {e}')
        return False

    form = {
        k: v for k, v in {
            'title': entry['title'],
            'interpretation': entry['interp'],
            'source_version_ids': vid,
            'manufacturer': entry.get('mfr', ''),
            'model_name': entry.get('mdl', ''),
            'component': entry.get('cmp', ''),
            'operation': entry.get('op', ''),
            'operating_conditions': entry.get('oc', ''),
            'sound_label': entry.get('lbl', ''),
            'annotation_notes': entry.get('note', ''),
            'machine_id': MACHINES.get(entry['m'], '')
        }.items() if v
    }

    for attempt in range(3):
        try:
            sa = get_sa(force_refresh=(attempt > 0))
            sb = get_sb(force_refresh=(attempt > 0))

            r = sa.post(
                BASE + '/audio/references',
                data=form,
                files={'file': (entry['title'][:25] + '.wav', audio, 'audio/wav')},
                headers={H: csrf(sa)},
                timeout=25
            )
            if r.status_code not in (200, 201):
                msg = r.json().get('error', {}).get('message', r.text[:100]) if 'json' in r.headers.get('content-type', '') else r.text[:100]
                print(f'  x Create ({r.status_code}): {msg}')
                if attempt == 2: return False
                time.sleep(1)
                continue

            data = r.json()
            ref_id = data['id']
            item_id = data['knowledge_item_id']

            sub = sa.post(BASE + f'/audio/references/{ref_id}/submit', headers={H: csrf(sa)}, timeout=15)
            if sub.status_code not in (200, 201):
                print(f'  x Submit ({sub.status_code})')
                if attempt == 2: return False
                time.sleep(1)
                continue

            time.sleep(0.1)
            app = sb.post(
                BASE + f'/reviews/{item_id}/decision',
                json={'decision': 'APPROVED', 'comments': 'Approved.'},
                headers={H: csrf(sb)},
                timeout=15
            )
            if app.status_code not in (200, 201):
                print(f'  x Approve ({app.status_code})')
                if attempt == 2: return False
                time.sleep(1)
                continue

            existing_titles.add(entry['title'])
            return True
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as conn_err:
            print(f'  ! Connection retry {attempt + 1}: {conn_err}')
            time.sleep(1.5 * (attempt + 1))
        except Exception as ex:
            print(f'  x Unexpected: {ex}')
            if attempt == 2: return False
            time.sleep(1)

    return False

if __name__ == '__main__':
    from app.db.session import SessionLocal
    from app.models.audio import AudioReference

    db = SessionLocal()
    existing_titles = set(
        r[0] for r in db.query(AudioReference.title).filter(AudioReference.status == 'published').all()
    )
    db.close()

    print('=' * 70)
    print(f'  Seeding 100 medical equipment audio references')
    print('  Machines: X-Ray | CT Scan | MRI | ECG  (25 each)')
    print(f'  Already published in DB: {len(existing_titles)}')
    print('=' * 70)

    sa = get_sa()
    vid = get_vid(sa)
    ok = 0
    skipped = 0
    fail = 0
    prev_m = ''

    for i, entry in enumerate(REFS):
        m = entry['m']
        if m != prev_m:
            print(f'\n--- {m.upper()} ---')
            prev_m = m

        res = seed(entry, vid, existing_titles)
        if res == 'SKIP':
            st = 'SKIP'
            skipped += 1
        elif res:
            st = 'OK  '
            ok += 1
        else:
            st = 'FAIL'
            fail += 1

        print(f'  [{i+1:3d}] {st}  [{entry["lbl"]}] {entry["title"][:55]}')
        time.sleep(0.05)

    print(f'\n{"=" * 70}')
    print(f'  Done: {ok} new published  |  {skipped} skipped (already present)  |  {fail} failed')
    print('  View: http://localhost:5174/app/sound-analysis')
    print('=' * 70)
