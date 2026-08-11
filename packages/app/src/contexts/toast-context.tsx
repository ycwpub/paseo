import { createContext, useContext, type ReactNode } from "react";
import { ToastViewport, useToastHost, type ToastApi } from "@/components/toast-host";

const ToastContext = createContext<ToastApi | null>(null);

export function useOptionalToast(): ToastApi | null {
  return useContext(ToastContext);
}

export function useToast(): ToastApi {
  const value = useOptionalToast();
  if (!value) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { api, toast, dismiss } = useToastHost();

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
