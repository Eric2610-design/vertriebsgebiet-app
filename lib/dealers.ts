export type Dealer = {
  id: number;
  name: string;
  city: string;
  street?: string;
  phone?: string;
  email?: string;
  lat: number;
  lng: number;
};

export const dealers: Dealer[] = [
  {
    id: 1,
    name: "Test-Händler Frankfurt",
    city: "Frankfurt am Main",
    street: "Musterstraße 1",
    phone: "069 123456",
    email: "frankfurt@test-haendler.de",
    lat: 50.11,
    lng: 8.68,
  },
  {
    id: 2,
    name: "Test-Händler Berlin",
    city: "Berlin",
    street: "Beispielweg 5",
    phone: "030 987654",
    email: "berlin@test-haendler.de",
    lat: 52.52,
    lng: 13.405,
  },
];
