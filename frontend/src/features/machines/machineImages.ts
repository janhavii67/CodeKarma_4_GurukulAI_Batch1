export function getMachineImage(name?: string, category?: string | null): string {
  const normalized = `${name || ''} ${category || ''}`.toLowerCase();
  if (normalized.includes('ct') || normalized.includes('scan') || normalized.includes('computed')) {
    return '/assets/machines/ct-scan.jpg';
  }
  if (normalized.includes('mri') || normalized.includes('resonance')) {
    return '/assets/machines/mri.jpg';
  }
  if (normalized.includes('ecg') || normalized.includes('cardio') || normalized.includes('defib')) {
    return '/assets/machines/ecg.jpg';
  }
  if (normalized.includes('x-ray') || normalized.includes('xray') || normalized.includes('radiograph')) {
    return '/assets/machines/x-ray.jpg';
  }
  if (normalized.includes('dialysis') || normalized.includes('ventilator')) {
    return '/assets/machines/ecg.jpg';
  }
  return '/assets/machines/ct-scan.jpg';
}
