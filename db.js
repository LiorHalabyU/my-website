/*
  db.js - Vanilla JS library for managing costs in LocalStorage.
  Core database library for the Cost Manager application.
  Manages LocalStorage operations, data validation, and currency conversions.
  Works as an independent module and exposes the global 'db' object.
*/
(function () {
    "use strict";

    // Supported currencies for the application
    const currenciesSupported = ['USD', 'ILS', 'GBP', 'EURO'];

    const urlStorageName = 'exchangeRatesUrl';

    // Default exchange rates, used as a hardcoded in case the fetching not working so the app still working
    let currentRates = {
        "USD": 1,
        "GBP": 0.6,
        "EURO": 0.7,
        "ILS": 3.4
    };

    /*
      Checks if the provided currency is in the supported list.
      Returns a boolean (true if supported, false otherwise).
    */
    function isCurrencySupported(currency) {
        return currenciesSupported.includes(currency);
    }

    /*
      Validates that the cost object contains all required fields with correct types.
      Returns nothing, but throws an Error if validation fails.
    */
    function validateAddCost(cost){
        // Ensure the input is a valid object and not null
        if(cost === null || typeof cost !== 'object'){
            throw new Error('Cost is not an object');
        }

        // Validate that the sum is a valid positive number
        if(typeof cost.sum !== 'number' || isNaN(cost.sum) || cost.sum <= 0){
            throw new Error('New cost sum is not a positive number');
        }

        // Verify currency is valid against our predefined list
        if(typeof cost.currency !== 'string' || !isCurrencySupported(cost.currency)){
            throw new Error('New cost currency is not a string of one of the supported currencies');
        }

        // Check if category is non-empty string
        if(typeof cost.category !== 'string' || cost.category.trim() === ''){
            throw new Error('New cost category must be a non-empty string');
        }

        // Check if description is non-empty string
        if(typeof cost.description !== 'string' || cost.description.trim() === ''){
            throw new Error('New cost description must be a non-empty string');
        }
    }

    /*
      Validates the parameters needed for generating a report.
      Returns nothing, but throws an Error if any parameter is invalid.
    */
    function validateGetReport(currency, year, month){
        // Ensure the requested currency is supported
        if(typeof currency !== 'string' || !isCurrencySupported(currency)){
            throw new Error('Report currency is not a string of one of the supported currencies');
        }

        // Ensure the year is a positive integer
        if(!Number.isInteger(year) || year <= 0){
            throw new Error('Report year must be a positive integer');
        }

        // Validate the month is within the standard 1-12 range and an integer
        if(!Number.isInteger(month) || month < 1 || month > 12){
            throw new Error('Report month must be a integer between 1 and 12');
        }
    }

    /*
      Retrieves costs from LocalStorage and parses them.
      Returns an array of costs, or an empty array if invalid/not found.
    */
    function getCostsFromStorage(dbName){
        try {
            // Attempt to get and parse the data from local storage
            const storedData = localStorage.getItem(dbName);
            if(!storedData){
                return [];
            }

            const parsedData = JSON.parse(storedData);

            // Ensure the parsed data is actually an array before returning
            return Array.isArray(parsedData) ? parsedData : [];
        }
        catch(error){
            return [];
        }
    }

    /*
      Saves the provided costs array into LocalStorage as a JSON string.
      Returns nothing.
    */
    function setCostsToStorage(dbName, costs){
        localStorage.setItem(dbName, JSON.stringify(costs));
    }

    /*
      Calculates the current date and formats it into an object.
      Returns an object containing the current day, month, and year.
    */
    function getCurrentDate(){
        const nowDate = new Date();

        // Month is zero-indexed, so we add 1 for correct representation
        return {
            day: nowDate.getDate(),
            month: nowDate.getMonth() + 1,
            year: nowDate.getFullYear()
        };
    }

    /*
      Initializes the database if needed and establishes a connection.
      Returns an object exposing the addCost and getReport methods.
    */
    function openCostsDB(databaseName, databaseVersion){
        // Check if database name is non-empty string
        if(typeof dbName !== 'string' || dbName.trim() === ''){
            throw new Error('DB name must be a non-empty string');
        }

        // Initialize with an empty array if the database is newly created
        if(localStorage.getItem(databaseName) === null){
            setCostsToStorage(databaseName, []);
        }

        return {
            /*
              Validates and saves a new cost item to LocalStorage, appending the date.
              Returns the inserted cost object (excluding the date field).
            */
            addCost: function(cost){
                validateAddCost(cost);

                // Get the current costs data and the current date
                const currCostsData = getCostsFromStorage(databaseName);
                const nowDate = getCurrentDate();

                // Construct the full cost object including the current date
                const newCost = {
                    sum : cost.sum,
                    currency: cost.currency,
                    category: cost.category,
                    description: cost.description,
                    date: nowDate
                };

                // Add the new cost to the array and save back to storage
                currCostsData.push(newCost);
                setCostsToStorage(databaseName, currCostsData);

                // Return the inserted cost
                return {
                    sum: cost.sum,
                    currency: cost.currency,
                    category: cost.category,
                    description: cost.description
                };
            },

            /*
              Generates a monthly report with costs converted to the requested currency.
              Returns an object containing year, month, formatted costs array, and total sum.
            */
            getReport: function (currency, year, month){
               // Get the current costs data and the current date
               const costs = getCostsFromStorage(databaseName);
               const nowDate = getCurrentDate();

               // Fallback to current year and month if not explicitly provided
               const targetYear = year !== undefined ? year : nowDate.year;
               const targetMonth = month !== undefined ? month : nowDate.month;

               validateGetReport(currency, targetYear, targetMonth);

               let totalSum = 0;
               let reportCosts = [];

               // Iterate through all costs and filter by the requested time frame
               costs.forEach(cost => {
                  // Filter the costs by year and month that requested
                  if(cost.date.year === targetYear && cost.date.month === targetMonth){
                      // Make currency convert only if the cost currency is not the target currency
                      if(cost.currency !== currency){
                          // Convert sum to the requested currency using the USD base rate
                          const costInUSD = cost.sum / currentRates[cost.currency];
                          const costInTargetCurrency = costInUSD * currentRates[currency];

                          totalSum += costInTargetCurrency;
                      }
                      else {
                          totalSum += cost.sum;
                      }

                      // Append the filtered cost to the report array
                      reportCosts.push({
                          sum: cost.sum,
                          currency: cost.currency,
                          category: cost.category,
                          description: cost.description,
                          date: {
                              day: cost.date.day
                          }
                      });
                  }
               });

               // Return the finalized report structure
               return {
                   year: targetYear,
                   month: targetMonth,
                   costs: reportCosts,
                   total: {
                       currency: currency,
                       sum: totalSum
                   }
               };
            }
        }
    }

    // Expose the database methods to the global window object
    window.db = {
        openCostsDB: openCostsDB
    };

    /*
      Saves a custom URL for fetching exchange rates into LocalStorage.
      Returns nothing.
    */
    window.db.setRatesUrl = function(url){
        if (typeof url === 'string' && url.trim() !== ''){
            localStorage.setItem(urlStorageName, url);
        }
        else{
            throw new Error('URL must be a non-empty string');
        }
    }

    /*
      Retrieves the custom URL for exchange rates from LocalStorage.
      Returns the saved URL as a string, or null if it doesn't exist.
    */
    window.db.getRatesUrl = function () {
        return localStorage.getItem(urlStorageName);
    };

    /*
      Updates the internal exchange rates object based on the fetched data.
      Returns nothing.
    */
    window.db.setExchangeRates = function(rates){
        if (!rates || typeof rates !== "object") {
            throw new Error('Rates must be a valid object');
        }

        // Iterate over supported currencies and update if valid
        currenciesSupported.forEach(function (currency) {
            if (typeof rates[currency] === "number" && rates[currency] > 0) {
                currentRates[currency] = rates[currency];
            }
        });
    };

    /*
      Provides access to the currently loaded exchange rates.
      Returns a copy of the current exchange rates object.
    */
    window.db.getExchangeRates = function () {
        return { ...currentRates };
    };

})();