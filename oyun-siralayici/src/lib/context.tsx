import { createContext, useContext } from "react";
import type { Bootstrap, Game } from "../../shared/types";
export interface AppContextValue {
  data: Bootstrap;
  setData: React.Dispatch<React.SetStateAction<Bootstrap | null>>;
  run: (method: string, args?: any, success?: string) => Promise<any>;
  toast: (text: string, error?: boolean) => void;
  modal: (type: string, props?: any) => void;
  close: () => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  active: Game | undefined;
  setActive: (id: string | null) => void;
  scope: string;
  setScope: (scope: string) => void;
  chatOpen: boolean;
  setChatOpen: (value: boolean) => void;
  mention: (game: Game) => void;
}
export const Context = createContext<AppContextValue>(null!);
export const useApp = () => useContext(Context);
