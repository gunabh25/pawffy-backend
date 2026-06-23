const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  profileImage: true,
  city: true,
  state: true,
  role: true,
};

const PARTNER_PUBLIC_SELECT = {
  id: true,
  name: true,
  profileImage: true,
  city: true,
  state: true,
  latitude: true,
  longitude: true,
  role: true,
};

const PRIVATE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  profileImage: true,
  address: true,
  city: true,
  state: true,
  latitude: true,
  longitude: true,
};

module.exports = {
  PUBLIC_USER_SELECT,
  PARTNER_PUBLIC_SELECT,
  PRIVATE_USER_SELECT,
};
