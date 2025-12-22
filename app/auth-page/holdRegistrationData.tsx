import { create } from "zustand";

type RegistrationState = {
  username: string;
  email: string;
  password: string;
  user_role: "job-seeker" | "employer" | "";
  registrationNo?: string | null;
  setAll: (data: Partial<RegistrationState>) => void;
  reset: () => void;
};

export const useRegistrationStore = create<RegistrationState>((set) => ({
  username: "",
  email: "",
  password: "",
  user_role: "",
  registrationNo: null,
  setAll: (data) => set((state) => ({ ...state, ...data })),
  reset: () =>
    set({
      username: "",
      email: "",
      password: "",
      user_role: "",
      registrationNo: null,
    }),
}));
