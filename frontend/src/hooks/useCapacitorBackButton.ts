import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Handles the Android hardware back button in Capacitor.
 * @param onBack - Return true if back was handled (e.g. closed a modal, navigated back).
 *                 Return false to use default behavior (history.back or minimize).
 */
export function useCapacitorBackButton(onBack: () => boolean) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('backButton', ({ canGoBack }) => {
      const handled = onBack();
      if (!handled) {
        if (canGoBack) {
          window.history.back();
        } else {
          App.minimizeApp();
        }
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [onBack]);
}
