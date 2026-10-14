Feature: City-based activity ranking from a seven-day weather forecast
  A user enters a city or town and receives, for each of the next seven days, a ranked list of
  Skiing, Surfing, Outdoor Sightseeing and Indoor Sightseeing based on Open-Meteo weather data.
  Open-Meteo is replaced by a local stub so every weather input is deterministic.

  # ---------------------------------------------------------------- location search

  @location @partial-match
  Scenario: Suggest candidate locations for a partial name
    When I search for locations matching "San"
    Then the response status should be 200
    And the location matches should be exactly "San Diego, San Francisco, San Jose"
    And every location match should include a name, country and coordinates

  @location @partial-match
  Scenario: Partial matching ignores letter case and surrounding whitespace
    When I search for locations matching "  sAn f "
    Then the response status should be 200
    And the location matches should be exactly "San Francisco"

  @location @partial-match
  Scenario: A partial name with no candidates returns an empty list
    When I search for locations matching "zzqv-unmapped-town-94821"
    Then the response status should be 200
    And the location matches should be exactly ""

  @location @validation
  Scenario Outline: Reject a location search without a usable query
    When I search for locations with query <query>
    Then the response status should be 400
    And the error response should explain that query is required

    Examples:
      | query     |
      | "<absent>" |
      | ""        |
      | "   "     |

  # ---------------------------------------------------------------- ranking: contract

  @ranking @contract
  Scenario: Rank all four activities for each of the next seven days
    Given Open-Meteo reports a sunny week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And the ranked location should be "Lisbon"
    And the forecast should cover the seven dates served by Open-Meteo
    And every forecast day should include all supported activities
    And every activity result should include a date, rank, suitability and reasoning

  @ranking @contract
  Scenario: Suitability is a number between 0 and 100
    Given Open-Meteo reports a sunny week for "Reykjavik"
    When I request activity rankings for "Reykjavik"
    Then the response status should be 200
    And every suitability score should be between 0 and 100 inclusive

  @ranking @contract
  Scenario: Activities are ordered from most to least suitable with matching ranks
    Given Open-Meteo reports a rainy week for "Reykjavik"
    When I request activity rankings for "Reykjavik"
    Then the response status should be 200
    And activities for each day should be ordered by descending suitability
    And ranks for each day should run from 1 to 4 in order

  @ranking @contract
  Scenario: Location names are matched ignoring case and surrounding whitespace
    Given Open-Meteo reports a sunny week for "Lisbon"
    When I request activity rankings for "  lISBON "
    Then the response status should be 200
    And the ranked location should be "Lisbon"

  # ---------------------------------------------------------------- ranking: weather behaviour

  @ranking @weather
  Scenario: Heavy snowfall favours skiing
    Given Open-Meteo reports a snowy week for "Zermatt"
    When I request activity rankings for "Zermatt"
    Then the response status should be 200
    And on every day "Skiing" should rank first
    And on every day "Skiing" should score higher than "Surfing"
    And the reasoning for "Skiing" on every day should mention "snow"

  @ranking @weather
  Scenario: Clear mild weather favours outdoor sightseeing over indoor sightseeing
    Given Open-Meteo reports a sunny week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And on every day "Outdoor Sightseeing" should score higher than "Indoor Sightseeing"
    And on every day "Outdoor Sightseeing" should score higher than "Skiing"
    And the reasoning for "Outdoor Sightseeing" on every day should mention "clear"
    And the reasoning for "Outdoor Sightseeing" on every day should mention "22"

  @ranking @weather
  Scenario: Heavy rain and strong wind favour indoor sightseeing
    Given Open-Meteo reports a rainy week for "Oslo"
    When I request activity rankings for "Oslo"
    Then the response status should be 200
    And on every day "Indoor Sightseeing" should rank first
    And on every day "Indoor Sightseeing" should score higher than "Outdoor Sightseeing"
    And the reasoning for "Outdoor Sightseeing" on every day should mention "rain"

  @ranking @weather
  Scenario: Large waves with mild weather favour surfing
    Given Open-Meteo reports a surf week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And on every day "Surfing" should score higher than "Skiing"
    And on every day "Surfing" should score higher than "Indoor Sightseeing"
    And the reasoning for "Surfing" on every day should mention "wave"

  # ---------------------------------------------------------------- ranking: Open-Meteo usage

  @ranking @dependency
  Scenario: The forecast is fetched from Open-Meteo for the resolved coordinates
    Given Open-Meteo reports a sunny week for "Lisbon"
    When I request activity rankings for "Lisbon"
    Then the response status should be 200
    And Open-Meteo should have been asked to geocode "Lisbon"
    And Open-Meteo should have been asked for a seven-day forecast at the coordinates of "Lisbon"

  # ---------------------------------------------------------------- ranking: errors

  @ranking @validation
  Scenario Outline: Reject a ranking request without a usable location
    When I request activity rankings with location <location>
    Then the response status should be 400
    And the error response should explain that location is required
    And Open-Meteo should not have been called

    Examples:
      | location   |
      | "<absent>" |
      | ""         |
      | "   "      |

  @ranking @validation
  Scenario: Report an unknown city without calling the forecast service
    When I request activity rankings for "zzqv-unmapped-town-94821"
    Then the response status should be 404
    And the error response should explain that no location matched
    And Open-Meteo should not have been asked for a forecast

  @ranking @dependency
  Scenario: Return a gateway error when the Open-Meteo forecast fails
    Given Open-Meteo reports a sunny week for "Oslo"
    And the Open-Meteo forecast service is failing
    When I request activity rankings for "Oslo"
    Then the response status should be 502
    And the error response should explain that forecast data is temporarily unavailable

  @ranking @dependency
  Scenario: Return a gateway error when the Open-Meteo geocoding fails
    Given the Open-Meteo geocoding service is failing
    When I request activity rankings for "Oslo"
    Then the response status should be 502
    And the error response should explain that forecast data is temporarily unavailable
