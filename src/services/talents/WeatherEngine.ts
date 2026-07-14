/**
 * WeatherEngine — get current weather and forecast for a location.
 *
 * Architecture (ADR-2026-004): Client-direct connection to wttr.in,
 * no intermediate server, no API key required. wttr.in is a free,
 * open-source weather service that returns JSON-formatted data.
 *
 * Supports:
 * - Current weather conditions (temp, humidity, wind, etc.)
 * - 3-day forecast
 * - Location by city name, airport code, or coordinates
 * - Multiple output formats (text summary, detailed)
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';
import {checkNetworkAccess, getNetworkDisabledError} from './networkUtils';

const WTTR_BASE = 'https://wttr.in';
const REQUEST_TIMEOUT_MS = 10000;

interface WeatherCurrent {
  temp_C: string;
  temp_F: string;
  humidity: string;
  windspeedKmph: string;
  winddir16Point: string;
  weatherDesc: string;
  feelsLikeC: string;
  feelsLikeF: string;
  uvIndex: string;
  visibility: string;
  pressure: string;
  cloudcover: string;
  precipMM: string;
}

interface WeatherDay {
  date: string;
  maxtempC: string;
  maxtempF: string;
  mintempC: string;
  mintempF: string;
  avgtempC: string;
  avgtempF: string;
  uvIndex: string;
  hourly: Array<{
    time: string;
    tempC: string;
    tempF: string;
    weatherDesc: string;
    windspeedKmph: string;
    humidity: string;
    chanceofrain: string;
  }>;
  astronomy?: Array<{
    sunrise: string;
    sunset: string;
    moonrise: string;
    moonset: string;
  }>;
}

interface WeatherData {
  current_condition: WeatherCurrent[];
  weather: WeatherDay[];
  nearest_area: Array<{
    areaName: Array<{value: string}>;
    country: Array<{value: string}>;
    region: Array<{value: string}>;
  }>;
}

export class WeatherEngine implements TalentEngine {
  readonly name = 'weather';
  readonly recommendedContextTokens = 600;

  async execute(args: Record<string, any>): Promise<TalentResult> {
    if (!checkNetworkAccess()) {
      return getNetworkDisabledError('weather');
    }

    const location =
      typeof args.location === 'string' ? args.location.trim() : '';

    if (!location) {
      return {
        type: 'error',
        summary: 'weather: missing or empty "location" argument',
        errorMessage:
          'location argument is required (city name, airport code, or coordinates).',
      };
    }

    const days =
      typeof args.days === 'number' && args.days > 0
        ? Math.min(Math.max(args.days, 1), 3)
        : 1;

    const unit =
      typeof args.unit === 'string' && ['c', 'f'].includes(args.unit.toLowerCase())
        ? args.unit.toLowerCase()
        : 'c';

    const format =
      typeof args.format === 'string' &&
      ['summary', 'detailed'].includes(args.format)
        ? (args.format as 'summary' | 'detailed')
        : 'summary';

    try {
      const url = `${WTTR_BASE}/${encodeURIComponent(location)}?format=j1`;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PocketPalAI/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            type: 'error',
            summary: `weather: location "${location}" not found`,
            errorMessage:
              'Could not find weather data for this location. Try a different city name or check spelling.',
          };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: WeatherData = await response.json();

      if (!data.current_condition || data.current_condition.length === 0) {
        return {
          type: 'error',
          summary: `weather: no data available for "${location}"`,
          errorMessage: 'No weather data returned for this location.',
        };
      }

      const locationName = this.formatLocationName(data);

      return {
        type: 'text',
        summary: this.formatWeather(
          data,
          locationName,
          days,
          unit as 'c' | 'f',
          format,
        ),
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const errMsg = isAbort
        ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : e instanceof Error
          ? e.message
          : String(e);
      return {
        type: 'error',
        summary: `weather: ${errMsg}`,
        errorMessage: errMsg,
      };
    }
  }

  private formatLocationName(data: WeatherData): string {
    if (data.nearest_area && data.nearest_area.length > 0) {
      const area = data.nearest_area[0];
      const city = area.areaName?.[0]?.value || '';
      const region = area.region?.[0]?.value || '';
      const country = area.country?.[0]?.value || '';

      const parts = [city, region, country].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
    return 'Unknown location';
  }

  private formatWeather(
    data: WeatherData,
    locationName: string,
    days: number,
    unit: 'c' | 'f',
    format: 'summary' | 'detailed',
  ): string {
    const lines: string[] = [];
    const current = data.current_condition[0];

    lines.push(`Weather for ${locationName}`);
    lines.push('');

    const tempUnit = unit === 'c' ? 'C' : 'F';
    const tempCurrent = unit === 'c' ? current.temp_C : current.temp_F;
    const feelsLike = unit === 'c' ? current.feelsLikeC : current.feelsLikeF;

    lines.push('**Current Conditions:**');
    lines.push(`  Temperature: ${tempCurrent}°${tempUnit} (feels like ${feelsLike}°${tempUnit})`);
    lines.push(`  Condition: ${current.weatherDesc || 'N/A'}`);
    lines.push(`  Humidity: ${current.humidity}%`);
    lines.push(`  Wind: ${current.windspeedKmph} km/h ${current.winddir16Point}`);
    lines.push(`  UV Index: ${current.uvIndex}`);
    lines.push(`  Visibility: ${current.visibility} km`);
    lines.push(`  Pressure: ${current.pressure} hPa`);
    lines.push(`  Cloud cover: ${current.cloudcover}%`);

    if (days > 0 && data.weather && data.weather.length > 0) {
      const forecastDays = data.weather.slice(0, days);

      lines.push('');
      lines.push(`**${days}-Day Forecast:**`);
      lines.push('');

      for (let i = 0; i < forecastDays.length; i++) {
        const day = forecastDays[i];
        const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`;

        const maxTemp = unit === 'c' ? day.maxtempC : day.maxtempF;
        const minTemp = unit === 'c' ? day.mintempC : day.mintempF;

        lines.push(`**${dayLabel} (${day.date}):**`);
        lines.push(`  High: ${maxTemp}°${tempUnit} / Low: ${minTemp}°${tempUnit}`);
        lines.push(`  UV Index: ${day.uvIndex}`);

        if (format === 'detailed' && day.hourly && day.hourly.length > 0) {
          lines.push(`  Hourly breakdown:`);
          const keyHours = day.hourly.filter(h => {
            const hour = parseInt(h.time, 10);
            return hour % 600 === 0;
          });
          for (const hour of keyHours.slice(0, 4)) {
            const hourTemp = unit === 'c' ? hour.tempC : hour.tempF;
            const timeStr = this.formatTime(hour.time);
            lines.push(
              `    ${timeStr}: ${hourTemp}°${tempUnit}, ${hour.weatherDesc}, ${hour.chanceofrain}% rain`,
            );
          }
        }

        if (day.astronomy && day.astronomy.length > 0) {
          const astro = day.astronomy[0];
          lines.push(`  Sunrise: ${astro.sunrise} / Sunset: ${astro.sunset}`);
        }

        lines.push('');
      }
    }

    lines.push('');
    lines.push(`Source: wttr.in`);

    return lines.join('\n');
  }

  private formatTime(timeStr: string): string {
    const num = parseInt(timeStr, 10);
    const hours = Math.floor(num / 100);
    const mins = num % 100;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'weather',
        description:
          'Get current weather conditions and forecast for any location. ' +
          'No API key required. Supports city names, airport codes, and coordinates. ' +
          'Useful for: checking current weather, planning for weather, travel planning.',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description:
                'The location to get weather for. Can be a city name (e.g., "London", "Beijing"), ' +
                'airport code (e.g., "JFK", "LHR"), or coordinates (e.g., "40.7128,-74.0060").',
            },
            days: {
              type: 'number',
              description:
                'Number of forecast days to include (default: 1, max: 3).',
            },
            unit: {
              type: 'string',
              description:
                'Temperature unit: "c" for Celsius (default) or "f" for Fahrenheit.',
              enum: ['c', 'f'],
            },
            format: {
              type: 'string',
              description:
                'Detail level: "summary" (default, basic info) or "detailed" (includes hourly breakdown).',
              enum: ['summary', 'detailed'],
            },
          },
          required: ['location'],
        },
      },
    };
  }
}
