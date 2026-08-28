import type { StyleProp, TextInputProps, TextStyle } from "react-native";
import type { NativePastedFile } from "@/composer/native-pasted-image";

export interface EditingTextInputHandle {
  focus(): void;
  blur(): void;
  isFocused(): boolean;
  getText(): string;
  replaceText(text: string, selection?: { start: number; end: number }): void;
  getNativeRef(): unknown;
}

export interface EditingTextInputProps extends Omit<
  TextInputProps,
  "defaultValue" | "onChangeText" | "value"
> {
  initialValue?: string;
  /**
   * Optional controlled value. The platform implementations synchronize it
   * imperatively so IME composition is not interrupted by React rerenders.
   */
  value?: string;
  onChangeText?: (text: string) => void;
  textInputStyle?: StyleProp<TextStyle>;
  onPasteImages?: (files: readonly NativePastedFile[]) => void;
  onPasteError?: (message: string) => void;
  variant?: "default" | "bottom-sheet";
}
