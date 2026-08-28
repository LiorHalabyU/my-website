/*
  app.js
  Main frontend application logic for the Cost Manager.
  Handles DOM manipulation, event listeners, form submissions, API calls for rates,
  and renders dynamic data into tables and Chart.js components.
*/
const dbName = 'costsdb';
const chartColors = ['#1e40af', '#3b82f6', '#9ca3af', '#111827', '#06b6d4', '#4b5563', '#93c5fd'];
const monthsNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ratesFetchInterval = 1000 * 60 * 60;
const ratesDefaultUrl = 'https://cost-manager-2o03.onrender.com/';

// Initialize the application and UI state when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {

    let costsDatabase;

    // Attempt to open the local database and handle fatal errors gracefully
    try{
        costsDatabase = db.openCostsDB(dbName, 1);
    }
    catch(error){
        alert("Failed to open database: " + error.message);
    }

    // Manage application state in a centralized object
    const appState = {
        costsDatabase: costsDatabase,
        pieChart: null,
        barChart: null
    };

    // Pre-fill the filter form with the current year and month
    const nowDate = new Date();
    document.getElementById('filterYear').value = nowDate.getFullYear();
    document.getElementById('filterMonth').value = nowDate.getMonth() + 1;

    // Load any previously saved custom URL into the settings input
    const savedUrl = db.getRatesUrl()
    if(savedUrl){
        document.getElementById('ratesUrl').value = savedUrl;
    }

    let isFetchingRates = false;

    // Perform the initial rates fetch before setting up the dashboard
    fetchRates().then(() => {
        setupEventListeners(appState);
        updateDashboard(appState);

        // Schedule periodic fetching of exchange rates using setInterval
        setInterval(async () => {
            if(isFetchingRates) return;

            isFetchingRates = true;

            await fetchRates();
           updateDashboard(appState);
           console.log('Rates updated automatically');
           isFetchingRates = false;

        }, ratesFetchInterval);
    });
});

/*
  Fetches exchange rates from the configured URL or default fallback.
  Returns a Promise that resolves when the fetch is complete.
*/
async function fetchRates(){
    let fetchUrl = db.getRatesUrl()

    // Revert to the default local rates file if no custom URL is provided
    if(!fetchUrl){
        fetchUrl = ratesDefaultUrl;
    }

    try {
        const response = await fetch(fetchUrl);

        // Only update rates if the response from the server is successful
        if(response.ok){
            const rates = await response.json();
            db.setExchangeRates(rates);
            console.log('Rates loaded successfully from server')
        }
        else{
            console.error('Server responded with an error, relying on cached rates');
        }
    }
    catch(error){
        console.error('Failed to fetch rates, relying on cached rates');
    }
}

/*
  Binds event listeners to forms and buttons across the application.
  Returns nothing.
*/
function setupEventListeners(appState) {
    document.getElementById('addCostForm').addEventListener('submit', event => {handleAddCost(event, appState)});
    //document.getElementById('reportForm').addEventListener('change', () => updateDashboard(appState));
    document.getElementById('reportForm').addEventListener('input', () => updateDashboard(appState));
    document.getElementById('saveSettings').addEventListener('click', () => handleSaveSettings(appState));
}

/*
  Handles the logic for extracting form data and saving a new cost.
  Returns nothing.
*/
function handleAddCost(event, appState){
    event.preventDefault();

    // Extract values from the input elements
    const cost = {
        sum: parseFloat(document.getElementById('sum').value),
        currency: document.getElementById('currency').value,
        category: document.getElementById('category').value,
        description: document.getElementById('description').value
    };

    try{
        // Add the cost to the database and trigger a UI refresh
        appState.costsDatabase.addCost(cost);
        resetCostForm();
        updateDashboard(appState);
        alert('Cost added successfully');
    }
    catch(error){
        alert('Failed to add cost: ' + error.message);
    }

}

/*
  Clears the input fields in the add cost form.
  Returns nothing.
*/
function resetCostForm(){
    document.getElementById('sum').value = '';
    document.getElementById('currency').value = 'USD';
    document.getElementById('category').value = '';
    document.getElementById('description').value = '';
}

/*
  Saves user-defined URL settings and re-fetches the exchange rates.
  Returns nothing.
*/
function handleSaveSettings(appState){
    let url = document.getElementById('ratesUrl').value.trim();

    // Reset to default URL if the user submits an empty string
    if(url === ''){
        url = ratesDefaultUrl;
        document.getElementById('ratesUrl').value = url;
        console.log('No URL provided. Reverting to default URL');
    }

    try{
        // Save the setting and update the dashboard once the new rates are fetched
        db.setRatesUrl(url);
        fetchRates().then(() => {
            updateDashboard(appState);
            alert('Settings saved and Rates updated!');
        });
    }
    catch(error){
        console.error('Invalid settings: ' + error.message);
    }
}

/*
  Orchestrates the generation of the table and charts based on current filters.
  Returns nothing.
*/
function updateDashboard(appState){
    const year = parseInt(document.getElementById('filterYear').value);
    const month = parseInt(document.getElementById('filterMonth').value);
    const currency = document.getElementById('filterCurrency').value;

    // Prevent rendering if any of the required filter fields are empty
    if(!year || !month || !currency) return;

    try{
        // Retrieve data and update all three visual components
        const report = appState.costsDatabase.getReport(currency, year, month);
        renderReport(report);
        renderPieChart(report, appState);
        renderBarChart(currency, year, appState);
    }
    catch(error){
        alert("Failed to generate report: " + error.message);
    }

}

/*
  Renders the report data into the HTML table structure and handles empty states.
  Returns nothing.
*/
function renderReport(report){
    const tableBody = document.querySelector('#reportTable tbody');

    // Clear existing table content before rendering new data
    tableBody.innerHTML = '';

    // Display a full-width empty state message if no costs are found
    if (report.costs.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="4" class="no-costs-message">
                No costs found for this month and year
            </td>
        `;
        tableBody.appendChild(emptyRow);
    }
    else{
        // Iterate through costs and construct table rows
        report.costs.forEach(cost => {
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
            <td>${cost.date.day}/${report.month}/${report.year}</td>
            <td>${cost.category}</td>
            <td>${cost.description}</td>
            <td>${cost.sum} ${cost.currency}</td>
        `;
        tableBody.appendChild(newRow);
        });
    }

    // Update the total sum display below the table
    document.getElementById('totalReportSum').innerText = `Total: ${report.total.sum} ${report.total.currency}`;
}

/*
  Renders the pie chart aggregating costs by category.
  Returns nothing.
*/
function renderPieChart(report, appState){
    const emptyMsg = document.getElementById('pieChartEmptyMsg');
    const canvas = document.getElementById('pieChart');

    // Show empty message and hide canvas if no data exists
    if (report.costs.length === 0) {
        emptyMsg.style.display = 'block';
        canvas.style.display = 'none';
        if(appState.pieChart) appState.pieChart.destroy(); // מנקים את הגרף הישן
        return;
    }

    // Restore canvas visibility if data is present
    emptyMsg.style.display = 'none';
    canvas.style.display = 'block';

    const chartCategories = {};
    const rates = db.getExchangeRates();

    // Accumulate total costs per category in the requested currency
    report.costs.forEach(cost => {
        const usdSum = cost.sum / rates[cost.currency];
        const targetCurrencySum = usdSum * rates[report.total.currency];

        chartCategories[cost.category] = (chartCategories[cost.category] || 0) + targetCurrencySum;
    });

    const pieChartContext = document.getElementById('pieChart').getContext('2d');

    // Destroy previous chart instance to avoid rendering overlaps
    if(appState.pieChart) appState.pieChart.destroy();

    // Create the chart object
    appState.pieChart = new Chart(pieChartContext, {
       type: 'pie',
       data: {
           labels: Object.keys(chartCategories),
           datasets: [{
               data: Object.values(chartCategories),
               backgroundColor: chartColors
           }]
       },
       options: {maintainAspectRatio: false}
    });
}

/*
  Renders the bar chart showing total costs across all 12 months of the year.
  Returns nothing.
*/
function renderBarChart(currency, year, appState){
    let monthlyTotals = [];

    // Loop through all 12 months to fetch and store their respective totals
    for (let month = 1; month <= 12; month++){
        const report = appState.costsDatabase.getReport(currency, year, month);
        monthlyTotals.push(report.total.sum);
    }

    const barChartContext = document.getElementById('barChart').getContext('2d');

    // Destroy previous chart instance to avoid rendering overlaps
    if(appState.barChart) appState.barChart.destroy();

    // Create the chart object
    appState.barChart = new Chart(barChartContext, {
       type: 'bar',
       data: {
           labels: monthsNames,
           datasets: [{
               label: `Total Costs in ${currency}`,
               data: monthlyTotals,
               backgroundColor: chartColors[0]
           }]
       },
       options: {maintainAspectRatio: false}
    });
}
