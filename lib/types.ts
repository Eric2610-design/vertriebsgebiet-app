// Shared types for the Dealer Tool

// Manufacturer keys are dynamic (admins can add new ones).
export type ManufacturerKey = string;

export type Manufacturer = {
  key: string;
  label: string;
};

export type DealerDraft = {
  source: ManufacturerKey;
  external_id?: string | null;
  name: string;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  opening_hours?: string | null;
  source_url?: string | null;
};

export type Dealer = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: "missing" | "ok" | "manual" | "failed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  email: string;
  role: "rep" | "admin";
  created_at?: string;
};

export type Territory = {
  id: string;
  profile_email: string;
  country: string;
  plz2_from: number;
  plz2_to: number;
  created_at?: string;
};
