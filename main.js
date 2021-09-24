/////////////////////////////////////////// Store Data ///////////////////////////////////////////

const getStoreData = () => new Promise(function(resolve, reject) {
    // if stores with valid timestamp in local storage
    if(localStorage.getItem("stores")) {
        let currentDate = new Date().getTime();

        let storeData = JSON.parse(localStorage.getItem("stores"));
        let oldDate = storeData.date;
        let timeDiff = ((((Number(currentDate) - Number(oldDate)) / 1000) / 60) / 60); // converting result from milliseconds to hours
        if(timeDiff < 0.001) { 
            let ourStores = storeData.stores;
            resolve(ourStores);
            return;
        }
    }
    // if not valid
    fetchStores().then(stores => resolve(stores));
});

const fetchStores = () => new Promise(function(resolve, reject) {
    fetch("./stores.json")
        .then(response => response.json())
        .then(data => {
            setDataInLocalStorage(data.stores);
            resolve(data.stores);
        })
        .catch(error => {
            console.error(error);
        });
});

function setDataInLocalStorage(data) {
    let date = new Date().getTime();
    let storeData = {
        date: date,
        stores: data
    }
    localStorage.setItem("stores", JSON.stringify(storeData));
}

/////////////////////////////////////////// User Input - Autocomplete Functionality ///////////////////////////////////////////

function initAutocomplete() {
    // set up autocomplete
    const autocomplete = new google.maps.places.Autocomplete(
        document.getElementById("autocomplete"), {
            types: ["geocode"],
            componentRestrictions: {country: ["de", "at", "ch"]}
        }
    );

    const searchIcon = document.getElementById("search-icon"); 
    const searchbar = document.getElementById("autocomplete");

    // empty adress bar on page reload
    searchbar.value = null;

    // get place data when selecting option
    autocomplete.addListener("place_changed", placeChanged);
    searchIcon.addEventListener("click", placeChanged);

    function placeChanged() {
        let place = autocomplete.getPlace();

        if(place == undefined || !place.geometry) {
            // user did not select a prediction 
            window.alert("Bitte wiederholen Sie die Eingabe und wählen Sie eine der angezeigten Adressoptionen");
            return;
        } 

        // show selected place and save coordinates of selected place
        searchbar.value = place.formatted_address; 
        document.getElementById("searchbar").value = place.geometry.location.toString();

        // show close icon for deleting input
        changeSearchIcon();

        // get results
        calcAndShowResults();
    }
}

function changeSearchIcon() {
    document.getElementById("search-icon").classList.toggle("hidden");
    document.getElementById("close-icon").classList.toggle("hidden");
}

function deleteInput() {
    document.getElementById("autocomplete").value = null; 
    document.getElementById("searchbar").value = null;

    changeSearchIcon();
}

function requestUserLoc() {
    let lat, lon;

    navigator.geolocation.getCurrentPosition(function(position) {
        lat = position.coords.latitude;
        lon = position.coords.longitude;

        if(lat) {
            // show selected place and save coordinates of selected place
            const searchbar = document.getElementById("autocomplete");
            searchbar.value = lat + ", " + lon; 
            document.getElementById("searchbar").value = "(" + lat + ", " + lon + ")";
    
            // show close icon for deleting input
            changeSearchIcon();
    
            // get results
            calcAndShowResults();
        }
    });
}

/////////////////////////////////////////// Calculate Results ///////////////////////////////////////////

function calcAndShowResults() {
    if(!getUserLoc()) {
        window.alert("Bitte geben Sie eine Adresse ein.");
        return;
    }

    // show results as list or map
    function showResults(results) {
        initMap(results);
        showStoreList(results);
        // document.getElementById("view-toggle").classList.remove("hidden");
    }

    // get calculated results
    getResults().then(results => showResults(results));
}

const getResults = () => new Promise(function(resolve, reject) {
    if(localStorage.getItem("results")) {
        let searchParam = document.getElementById("searchbar").value;

        let results = JSON.parse(localStorage.getItem("results"));
        let savedSearchParam = results.searchParam;

        // if saved results are for current search -> return saved results
        if(searchParam == savedSearchParam) {
            console.log("results from storage");
            resolve(results.stores);
            return;
        }
    } 
    // if not -> new calculation
    resolve(getStoreData().then(ourStores => calcDistances(ourStores)));
});

function toggleView() {
    // if click on already selected option -> exit
    if(event.target.classList.contains("active")) {
        return;
    }

    // add active class to new selected view
    let toggleContainer = document.getElementById("view-toggle");
    let buttons = toggleContainer.getElementsByTagName("button");
    let buttonsArr = Array.from(buttons);

    buttonsArr.forEach(button => {
        button.classList.toggle("active");
    })

    // change visibility of result area and show new results
    document.getElementById("storelist").classList.toggle("hidden");
    document.getElementById("map").classList.toggle("hidden");
    calcAndShowResults();
}

/////////////////////////////////////////// Calculate Distances ///////////////////////////////////////////

function getUserLoc() {
    if(document.getElementById("searchbar").value) {
        let userLoc = document.getElementById("searchbar").value;
        userLoc = userLoc.substring(1, userLoc.length - 1)
        return userLoc;
    }
    return false;
}

// returns sorted list of distances for each store as an object with store id and distance to user
async function calcDistances(ourStores) {
    const origin = getUserLoc();
    const destinations = [];

    // Build array for the destinations (lat, lon) in the same order as array of our stores
    ourStores.forEach((store) => {
        const storeLoc = [store.lat, store.lon];
        destinations.push(storeLoc.toString());
    });

    // Retrieve the distances of each store to the user
    const service = new google.maps.DistanceMatrixService();
    const getDistanceMatrix = (service, parameters) => new Promise((resolve, reject) => {
        service.getDistanceMatrix(parameters, (response, status) => {
            if (status != google.maps.DistanceMatrixStatus.OK) {
                reject(response);
                console.log("Distance matrix not responding with 200 status code");
            } else {
                const distances = [];
                const results = response.rows[0].elements;
                for (let i=0; i<results.length; i++) {
                    const element = results[i];
                    const distanceText = element.distance.text;
                    const distanceVal = element.distance.value;
                    const durationText = element.duration.text;
                    const distanceObject = {
                        storeInfo: ourStores[i], // The returned list will be in the same order as the destinations list
                        distanceText: distanceText,
                        distanceVal: distanceVal,
                        duration: durationText
                    };
                    distances.push(distanceObject);
                }
                resolve(distances);
            }
        });
    });

    const distancesList = await getDistanceMatrix(service, {
        origins: [origin],
        destinations: destinations,
        travelMode: "DRIVING",
        unitSystem: google.maps.UnitSystem.METRIC,
    });

    // sort results by distance (asc)
    distancesList.sort((first, second) => {
        return first.distanceVal - second.distanceVal;
    });

    // set results in local storage
    saveResults(distancesList);

    return(distancesList);
}

function saveResults(distancesList) {
    let searchParam = document.getElementById("searchbar").value;
    let content = {
        searchParam: searchParam,
        stores: distancesList
    }
    localStorage.setItem("results", JSON.stringify(content));
}

/////////////////////////////////////////// Show Results As List ///////////////////////////////////////////

function showStoreList(results) {
    const resultsEl = document.getElementById("storelist");

    // remove existing results
    while(resultsEl.firstChild) {
        resultsEl.removeChild(resultsEl.firstChild);
    }

    for(i=0; i<6; i++) {
        let nameEl = results[i].storeInfo.name;
        let addressEl = results[i].storeInfo.adress;
        let openingEl = results[i].storeInfo.openingHours + " Uhr";
        let distanceEl = results[i].distanceText;
        let linkEl = getDirectionsLink(results[i].storeInfo);

        let storeEl = document.createElement("div");
        storeEl.classList.add("store");

        let storeContent = `<h4>${nameEl}</h4>`
                            + `<p class="light-font">${addressEl}</p>`
                            + `<p class="light-font">${openingEl}</p>`
                            + `<div class="distance-info">`
                                + `<img src="./assets/marker.png" alt="Marker">`
                                + `<p>${distanceEl}</p>`
                            + `</div>`
                            + `<a href="${linkEl}"><button>Routeninfo</button></a>`;

        storeEl.innerHTML = storeContent;

        resultsEl.appendChild(storeEl);
    }
}

function getDirectionsLink(storeInfo) {
    let origin = getUserLoc();
    let destination = storeInfo.lat + ", " + storeInfo.lon;
    let link = "https://www.google.de/maps/dir/" + origin + "/" + destination;
    return link;
}

/////////////////////////////////////////// Show Results As Map ///////////////////////////////////////////

function initMap(results) {
    // get user position
    let center = getUserLoc();
    center = center.split(", ");
    let centerLat = Number(center[0]);
    let centerLon = Number(center[1]);

    // create the map
    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 8,
        center: { lat: centerLat, lng: centerLon }
    });
  
    // loop through the results and place a marker for each store
    for (let i=0; i<results.length; i++) {
        let lat = results[i].storeInfo.lat;
        let lon = results[i].storeInfo.lon;
        let latLng = new google.maps.LatLng(lat, lon);
    
        let marker = new google.maps.Marker({
            position: latLng,
            icon: {
                url: "./assets/marker.png",
                size: new google.maps.Size(36, 40),
                scaledSize: new google.maps.Size(36, 40)
            }, 
            map: map
        });

        marker.infowindow = new google.maps.InfoWindow({
            content: createMarkerContent(results[i])
        });

        marker.addListener("click", function() {
            marker.infowindow.open(map, marker);
        });
    }
}

function createMarkerContent(result) {
    let link = getDirectionsLink(result.storeInfo);
    return "<div>"
        + `<h4>${result.storeInfo.name}</h4>`
        + `<p class="light-font">${result.storeInfo.adress}</p>`
        + `<p class="light-font">${result.storeInfo.openingHours + " Uhr"}</p>`
        + `<div class="distance-info">`
            + `<img src="./assets/marker.png" alt="Marker">`
            + `<p>${result.distanceText}</p>`
        + `</div>`
        + `<a href=\"${link}\"><button class=\"directions-button\">Routeninfo</button></a>`
    + "</div>"
}