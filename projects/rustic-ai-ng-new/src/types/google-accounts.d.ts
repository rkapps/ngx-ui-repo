interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
  locale?: string;
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface Google {
  accounts: {
    id: {
      initialize(config: GoogleIdConfig): void;
      renderButton(element: HTMLElement, options: GoogleButtonOptions): void;
      prompt(): void;
      disableAutoSelect(): void;
      revoke(hint: string, done: () => void): void;
    };
  };
}

declare interface Window {
  google?: Google;
  handleGoogleCredential?: (response: GoogleCredentialResponse) => void;
}
