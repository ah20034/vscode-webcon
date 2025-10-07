const R = 6371000; // 地球半径(m)

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bbox(lat, lng, radiusM) {
  const dLat = radiusM / 111320; // 1度 ≒ 111.32km
  const cosLat = Math.cos(lat * Math.PI / 180) || 1e-9;
  const dLng = radiusM / (111320 * cosLat);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

module.exports = { haversineMeters, bbox };