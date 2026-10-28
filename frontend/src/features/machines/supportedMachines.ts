/**
 * Machine identities that are supported by the medical knowledge workflows.
 * Names are presentation labels; all API writes must keep using the matched
 * registered machine's real database ID.
 */
export const SUPPORTED_MACHINES = [
  { label: 'MRI', aliases: ['mri'], codes: ['mri001'] },
  { label: 'CT-Scan', aliases: ['cityscan', 'ctscan', 'ctscanner'], codes: ['cityscan001'] },
  { label: 'Xray', aliases: ['xray'], codes: ['xray001'] },
  { label: 'ECG', aliases: ['ecg'], codes: ['ecg001'] },
] as const;

export type SupportedMachineLabel = typeof SUPPORTED_MACHINES[number]['label'];

export interface MachineIdentity {
  id: string;
  name: string;
  code?: string | null;
}

export interface SupportedMachineOption<T extends MachineIdentity> {
  label: SupportedMachineLabel;
  machine: T | null;
}

function normalizeMachineIdentity(value: string | null | undefined): string {
  return (value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesSupportedMachine<T extends MachineIdentity>(
  machine: T,
  supported: typeof SUPPORTED_MACHINES[number],
): boolean {
  const name = normalizeMachineIdentity(machine.name);
  const code = normalizeMachineIdentity(machine.code);
  return (supported.aliases as readonly string[]).some(alias => normalizeMachineIdentity(alias) === name)
    || (supported.codes as readonly string[]).includes(code);
}

/**
 * Resolve supported display choices to registered records. Ambiguous aliases
 * are deliberately unavailable unless exactly one record has the expected
 * catalog code, preventing an arbitrary machine ID from being selected.
 */
export function getSupportedMachineOptions<T extends MachineIdentity>(
  machines: readonly T[],
): SupportedMachineOption<T>[] {
  return SUPPORTED_MACHINES.map(supported => {
    const matches = machines.filter(machine => matchesSupportedMachine(machine, supported));
    let machine: T | null = matches.length === 1 ? matches[0] : null;
    if (matches.length > 1) {
      const codedMatches = matches.filter(candidate =>
        (supported.codes as readonly string[]).includes(normalizeMachineIdentity(candidate.code)),
      );
      if (codedMatches.length === 1) machine = codedMatches[0];
    }
    return { label: supported.label, machine };
  });
}

export function getSupportedMachineLabel(machine: MachineIdentity): SupportedMachineLabel | undefined {
  return SUPPORTED_MACHINES.find(supported => matchesSupportedMachine(machine, supported))?.label;
}

export function getUnavailableSupportedMachineLabels<T extends MachineIdentity>(
  machines: readonly T[],
): SupportedMachineLabel[] {
  return getSupportedMachineOptions(machines)
    .filter(option => !option.machine)
    .map(option => option.label);
}
