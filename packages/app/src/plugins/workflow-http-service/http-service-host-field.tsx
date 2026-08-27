import { useMemo } from "react";
import type { PluginHttpLocalAddress } from "@getpaseo/protocol/messages";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";

function addressLabel(address: PluginHttpLocalAddress): string {
  if (address.kind === "loopback") return `${address.address}（本机回环）`;
  return address.interfaceName ? `${address.address}（${address.interfaceName}）` : address.address;
}

export function HttpServiceHostField({
  value,
  addresses,
  loading,
  error,
  onChange,
}: {
  value: string;
  addresses: PluginHttpLocalAddress[];
  loading: boolean;
  error: string | null;
  onChange: (host: string) => void;
}) {
  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      addresses.map((address) => ({
        id: address.address,
        value: address.address,
        label: addressLabel(address),
        description:
          address.kind === "loopback" ? "仅本机进程可访问" : "仅绑定到当前 Host 的这张网卡",
      })),
    [addresses],
  );
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selected = addresses.find((address) => address.address === value);
    if (selected) {
      return {
        label: addressLabel(selected),
        description:
          selected.kind === "loopback"
            ? "仅本机进程可访问"
            : "局域网内可访问，但只监听当前 Host 的具体 IP",
      };
    }
    if (!value) return null;
    return {
      label: value,
      description: "当前地址不在本机候选中，请重新选择后保存。",
    };
  }, [addresses, value]);

  return (
    <SelectField
      label="监听地址"
      value={value || null}
      selectedDisplay={selectedDisplay}
      options={options}
      onChange={onChange}
      placeholder="选择本机 IP"
      emptyText={error ?? "没有可用的本机 IPv4 地址"}
      loading={loading}
      disabled={loading || options.length === 0}
      searchable
      searchPlaceholder="搜索 IP 或网卡"
      error={error}
    />
  );
}
