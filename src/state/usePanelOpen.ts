import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'harbour-tycoon/ui/panel-open';

/**
 * Whether the upgrades panel is showing. Remembered between visits, so a
 * player who likes the full-screen harbour keeps it. Not part of the save:
 * it is a view preference, and resetting the game leaves it alone.
 */
export function usePanelOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'false') setOpen(false);
      })
      .catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    setOpen((was) => {
      AsyncStorage.setItem(KEY, String(!was)).catch(() => {});
      return !was;
    });
  }, []);
  return [open, toggle];
}
