export const SETUP_SKIPPED_KEY = "agent-plutus-setup-skipped";
export const SETUP_SKIPPED_EVENT = "setup-skipped";

export interface SetupStep {
  label: string;
  href: string;
  done: boolean;
}
