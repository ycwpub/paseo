import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { PairDeviceSection } from "@/components/pair-device-section";

export interface PairDeviceModalProps {
  serverId: string;
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

// Client management exposes the same information and actions as desktop.
// Open near full height on compact screens so the client list is usable
// immediately instead of hiding most of it below the initial snap point.
const SNAP_POINTS: string[] = ["94%"];

export function PairDeviceModal({ serverId, visible, onClose, testID }: PairDeviceModalProps) {
  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.host.pairDevices.rowTitle") }),
    [t],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      snapPoints={SNAP_POINTS}
      desktopMaxWidth={480}
      testID={testID}
    >
      <PairDeviceSection serverId={serverId} active={visible} />
    </AdaptiveModalSheet>
  );
}
