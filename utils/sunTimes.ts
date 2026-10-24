// Sunrise and sunset for a date and place (NOAA's simplified solar equations),
// accurate to a minute or two, which is plenty for switching the theme.
// Returns null in polar day/night, when the sun doesn't rise or set.

const RAD = Math.PI / 180;

export function getSunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  // Day of the year (1–366) in local time
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);

  // Fractional year in radians, taken at noon
  const g = (2 * Math.PI / 365) * (dayOfYear - 1);

  // Equation of time (minutes) and solar declination (radians)
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);

  // Hour angle at sunrise/sunset (sun's centre 0.833° below the horizon)
  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl))
    - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null;
  const ha = Math.acos(cosHa) / RAD;

  // Minutes after midnight UTC
  const sunriseUtc = 720 - 4 * (lng + ha) - eqTime;
  const sunsetUtc = 720 - 4 * (lng - ha) - eqTime;

  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    sunrise: new Date(utcMidnight + sunriseUtc * 60000),
    sunset: new Date(utcMidnight + sunsetUtc * 60000),
  };
}
