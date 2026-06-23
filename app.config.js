const { expo } = require('./app.json');
const fs = require('fs');
const path = require('path');

function readEnvValue(key) {
  if (process.env[key]) return process.env[key];

  try {
    const envPath = path.join(__dirname, '.env');
    const envText = fs.readFileSync(envPath, 'utf8');
    const line = envText
      .split(/\r?\n/)
      .find((item) => item.trim().startsWith(`${key}=`));
    return line?.split('=').slice(1).join('=').trim();
  } catch {
    return undefined;
  }
}

const googleMapsApiKey = readEnvValue('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');

module.exports = {
  expo: {
    ...expo,
    android: {
      ...expo.android,
      config: {
        ...expo.android?.config,
        ...(googleMapsApiKey
          ? {
              googleMaps: {
                apiKey: googleMapsApiKey,
              },
            }
          : {}),
      },
    },
  },
};
