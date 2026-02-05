export type ManufacturerKey = "flyer"|"riese_mueller"|"bergamont"|"zeg"|"bico"|"kalkhoff";

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
  geocode_status: "missing"|"ok"|"manual"|"failed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};
