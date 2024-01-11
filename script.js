'use strict';

///////////////////////////////////////
// CLASSES (WORKOUT DATA)
class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in min
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    this.descriptionDate = `${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  async _geocodeLocation() {
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${this.coords[0]}&longitude=${this.coords[1]}`
      );
      const data = await response.json();

      if (data.error) {
        console.error('Error geocoding location: Request is too high!');
        return;
      }

      this.descriptionGeo = `${this.type[0].toUpperCase()}${this.type.slice(
        1
      )} in ${data.locality}, ${data.countryName}`;
    } catch (error) {
      console.error(error.message);
    }
  }

  async _getWeatherIcon() {
    try {
      const apiKey = '045a8fb63ec55e109f2849d4eb6c72fe';
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${this.coords[0]}&lon=${this.coords[1]}&units=metric&appid=${apiKey}`
      );

      const data = await response.json();

      if (data.weather && data.weather.length > 0) {
        const iconCode = data.weather[0].icon;
        this.weatherURL = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        this.workoutWeather =
          data.weather[0].main[0].toUpperCase() + data.weather[0].main.slice(1);
        this.workoutDegree = data.main.temp.toFixed(0) + ' °C';
      }

      return null;
    } catch (error) {
      console.error('Error fetching weather data:', error);
      return null;
    }
  }
}

class Running extends Workout {
  type = 'running';

  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    // km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

///////////////////////////////////////
// APPLICATION ARCHITECTURE
const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const sidebar = document.querySelector('.sidebar');
const deleteBtnPopup = document.querySelector('.warning-delete--btn');
const cancelBtnPopup = document.querySelector('.warning-cancel--btn');
const inputValidationPopup = document.querySelector('.input-validation-popup');
const deleteAllBtn = document.querySelector('.delete-all-btn');
const sortBtn = document.querySelector('.sort-btn');
const deleteAllPopup = document.querySelector('.delete-all-workouts-popup');
const deleteAllWorkoutsPopupBtn = document.querySelector(
  '.delete-all-workouts-delete-btn'
);
const cancelDeleteAllWorkoutsBtn = document.querySelector(
  '.delete-all-cancel-btn'
);
const yearEl = document.querySelector('.year');
yearEl.textContent = new Date().getFullYear();
const showAllBtn = document.querySelector('.show-all-btn');
const findMeBtn = document.querySelector('.find-me-btn');

class App {
  // Private class fields
  // Private instance properties (properties available on instances)
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  #editedCoords;
  #sortOrder = 'asc'; // Default sorting order is ascending
  #currentMapView; // To center the map when click sort

  constructor() {
    // Get user's position
    this._getPosition();

    // Get data from local storage
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField);
    containerWorkouts.addEventListener('click', this._moveToPopup.bind(this));
    containerWorkouts.addEventListener('click', this._deleteWorkout.bind(this));
    containerWorkouts.addEventListener('click', this._editWorkout.bind(this));
    sidebar.addEventListener('click', this._hideFormOnClick.bind(this));
    sidebar.addEventListener('click', this._returnNormalState.bind(this));
    containerWorkouts.addEventListener(
      'click',
      this._returnNormalStatework.bind(this)
    );
    deleteBtnPopup.addEventListener(
      'click',
      this._deleteWorkoutWithPopup.bind(this)
    );
    cancelBtnPopup.addEventListener(
      'click',
      this._cancelDeleteWithPopup.bind(this)
    );
    deleteAllBtn.addEventListener('click', this._deleteAllWorkouts.bind(this));
    deleteAllWorkoutsPopupBtn.addEventListener(
      'click',
      this._manageDeleteAllPopup.bind(this)
    );
    cancelDeleteAllWorkoutsBtn.addEventListener(
      'click',
      this._cancelDeleteAllWithPopup
    );
    sortBtn.addEventListener('click', this._sortWorkoutsByDistance.bind(this));

    showAllBtn.addEventListener('click', this._showAllWorkouts.bind(this));

    findMeBtn.addEventListener('click', this._findMe.bind(this));

    // Function buttons condition
    if (this.#workouts.length >= 1) {
      deleteAllBtn.classList.remove('hide');
      sortBtn.classList.remove('hide');
      findMeBtn.classList.remove('hide');
      showAllBtn.classList.remove('hide');
    }

    if (this.#workouts.length < 2) {
      deleteAllBtn.classList.add('hide');
      sortBtn.classList.add('hide');
      findMeBtn.classList.add('hide');
      showAllBtn.classList.add('hide');
    }

    // Check if the user has visited the page before
    const hasVisited = localStorage.getItem('visited');

    // Show welcome popup only if it's the first visit
    if (!hasVisited) {
      this._displayWelcomePopup();
    }
  }

  _getPosition() {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          alert('Could not get your position');
        }
      );
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;

    // Google maps equivalent
    console.log(`https://www.google.com/maps/@${latitude},${longitude}`);

    // Setting the coordinates from the position object
    const coords = [latitude, longitude];

    // Creating the map with leaflet
    this.#map = L.map('map').setView(coords, this.#mapZoomLevel);

    // Creating tile layers
    L.tileLayer('https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling clicks on map
    this.#map.on('click', this._showForm.bind(this));

    // Local storage related part
    // Render markers (at this point map is downloaded & available)
    this.#workouts.forEach(work => {
      this._renderWorkoutMarker(work);
    });
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;

    form.classList.remove('hidden');
    inputDistance.focus();

    const allWorkouts = document.querySelectorAll('.workout');
    allWorkouts.forEach(workout => {
      workout.style.opacity = '1';
      workout.style.transform = 'scale(1)';
      workout.style.filter = 'blur(0px)';
    });
  }

  _hideForm() {
    // Empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    // Hide form
    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  async _newWorkout(e) {
    // Input validation helper functions
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));
    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    // Preventing default behaviour of forms (reload page)
    e.preventDefault();

    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    let editedWorkout;

    if (form.classList.contains('edit')) {
      if (type === 'running') {
        // If workout running, create running object
        const cadence = +inputCadence.value;

        // Check if data is valid
        if (
          // !Number.isFinite(distance) ||
          // !Number.isFinite(duration) ||
          // !Number.isFinite(cadence)
          !validInputs(distance, duration, cadence) ||
          !allPositive(distance, duration, cadence)
        )
          // return alert('Inputs have to be positive numbers!');
          return this._showInputValidationPopup();

        // Create running object
        editedWorkout = new Running(
          this.#editedCoords,
          distance,
          duration,
          cadence
        );
      }

      // If workout cycling, create cycling object
      if (type === 'cycling') {
        const elevation = +inputElevation.value;

        // Check if data is valid
        if (
          !validInputs(distance, duration, elevation) ||
          !allPositive(distance, duration)
        )
          // return alert('Inputs have to be positive numbers!');
          return this._showInputValidationPopup();

        // Create cycling object
        editedWorkout = new Cycling(
          this.#editedCoords,
          distance,
          duration,
          elevation
        );
      }

      const workoutToDelete = this.#workouts.find(
        workout => workout.coords === editedWorkout.coords
      );

      const workoutToDeleteIndex = this.#workouts.findIndex(
        workout => workout.coords === editedWorkout.coords
      );

      const workoutToDeleteEl = document.querySelector(
        `[data-id="${workoutToDelete.id}"]`
      );

      // Remove old object from the workout array
      this.#workouts.splice(workoutToDeleteIndex, 1);

      // Call weather method
      await editedWorkout._getWeatherIcon();

      // Call geocoding method
      await editedWorkout._geocodeLocation();

      // Add new object to the workout array
      this.#workouts.push(editedWorkout);

      // Remove old workout element on the list
      workoutToDeleteEl.remove();

      // Remove old workout marker on map
      this._removeWorkoutMarker(workoutToDelete);

      // Render edited workout on list
      this._renderWorkout(editedWorkout);

      // Render edited workout on map as marker
      this._renderWorkoutMarker(editedWorkout);

      // Hide form + clear input fields
      this._hideForm();

      // Set local storage to all workouts
      this._setLocalStorage();

      // Remove the edit class from form
      setTimeout(() => form.classList.remove('edit'), 1000);

      this._handleWorkoutVisual();
    }

    if (!this.#mapEvent) return;

    if (!form.classList.contains('edit')) {
      // Get data from form
      const type = inputType.value;
      const distance = +inputDistance.value;
      const duration = +inputDuration.value;
      const { lat, lng } = this.#mapEvent.latlng;
      let workout;

      if (type === 'running') {
        // If workout running, create running object
        const cadence = +inputCadence.value;

        // Check if data is valid
        if (
          !validInputs(distance, duration, cadence) ||
          !allPositive(distance, duration, cadence)
        )
          return this._showInputValidationPopup();

        // Create running object
        workout = new Running([lat, lng], distance, duration, cadence);
      }

      // If workout cycling, create cycling object
      if (type === 'cycling') {
        const elevation = +inputElevation.value;

        // Check if data is valid
        if (
          !validInputs(distance, duration, elevation) ||
          !allPositive(distance, duration)
        )
          return this._showInputValidationPopup();

        // Create cycling object
        workout = new Cycling([lat, lng], distance, duration, elevation);
      }

      // Call weather method
      await workout._getWeatherIcon();

      // Call geocoding method
      await workout._geocodeLocation();

      // Add new object to the workout array
      this.#workouts.push(workout);

      // Render workout on list
      this._renderWorkout(workout);

      // Render workout on map as marker
      this._renderWorkoutMarker(workout);

      // Hide form + clear input fields
      this._hideForm();

      // Set local storage to all workouts
      this._setLocalStorage();

      this._handleWorkoutVisual();

      this._handleButtonsVisual();
    }
  }

  _handleWorkoutVisual() {
    const allWorkouts = document.querySelectorAll('.workout');
    allWorkouts.forEach(workout => {
      workout.style.opacity = '1';
      workout.style.transform = 'scale(1)';
      workout.style.filter = 'blur(0px)';
    });
  }

  _handleButtonsVisual() {
    // Show delete all and sort button
    if (this.#workouts.length > 1) {
      deleteAllBtn.classList.remove('hide');
      sortBtn.classList.remove('hide');
      showAllBtn.classList.remove('hide');
      findMeBtn.classList.remove('hide');
    }

    if (this.#workouts.length < 2) {
      deleteAllBtn.classList.add('hide');
      sortBtn.classList.add('hide');
      showAllBtn.classList.add('hide');
      findMeBtn.classList.add('hide');
    }
  }

  _renderWorkoutMarker(workout) {
    L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.descriptionGeo}`
      )
      .openPopup();
  }

  _renderWorkout(workout) {
    let html = `
      <li class="workout workout--${workout.type}" data-id="${workout.id}">
        <div class="workout-title-date">
        <h2 class="workout__title">${workout.descriptionGeo}</h2>
        <p class="workout__date">${workout.descriptionDate}</p>
        </div>
        <div class="weather-box">
        <div class="weather-bg">
        <img class="weather__icon" src="${workout.weatherURL}"/>
        <span class="weather__degree">${workout.workoutDegree}</span>
        </div>
        <div class="text-bg">
        <p class="workout__weather">${workout.workoutWeather}</p>
        </div>
        </div>
        <div class="workout__details">
          <span class="workout__icon">${
            workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
          }</span>
          <span class="workout__value">${workout.distance}</span>
          <span class="workout__unit">km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⏱</span>
          <span class="workout__value">${workout.duration}</span>
          <span class="workout__unit">min</span>
        </div>
    `;

    if (workout.type === 'running')
      html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.pace.toFixed(1)}</span>
          <span class="workout__unit">min/km</span>
          </div>
          <div class="workout__details">
          <span class="workout__icon">🦶🏼</span>
          <span class="workout__value">${workout.cadence}</span>
          <span class="workout__unit">spm</span>
          </div>
          `;

    if (workout.type === 'cycling')
      html += `
      <div class="workout__details">
        <span class="workout__icon">⚡️</span>
        <span class="workout__value">${workout.speed.toFixed(1)}</span>
        <span class="workout__unit">km/h</span>
      </div>
      <div class="workout__details">
        <span class="workout__icon">⛰</span>
        <span class="workout__value">${workout.elevationGain}</span>
        <span class="workout__unit">m</span>
      </div>
    `;

    html += `
    <button class="edit__btn ${workout.type}" data-id="${workout.id}">Edit</button>
    <button class="delete__btn" data-id="${workout.id}">Delete</button>
    </li>
    `;

    form.insertAdjacentHTML('afterend', html);
  }

  _moveToPopup(e) {
    const workoutEl = e.target.closest('.workout');
    const allWorkouts = document.querySelectorAll('.workout');

    if (!workoutEl) return;

    allWorkouts.forEach(workout => {
      workout.style.opacity = '0.75';
      workout.style.transform = 'scale(0.967)';
      workout.style.filter = 'blur(0.7px)';
    });

    workoutEl.style.opacity = '1';
    workoutEl.style.transform = 'scale(1)';
    workoutEl.style.filter = 'blur(0px)';

    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      pan: {
        duration: 1,
      },
    });
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this.#workouts = data;

    this.#workouts.forEach(work => {
      this._renderWorkout(work);
    });
  }

  _deleteWorkout(e) {
    if (e.target.classList.contains('delete__btn')) {
      // Open popup
      sidebar.classList.add('open');
    }
  }

  _deleteWorkoutWithPopup(e) {
    // that's the tricky part, setting event
    const deleteBtn = document.querySelector('.delete__btn');

    // Each delete button has an id of the workout that is created
    const workoutId = deleteBtn.dataset.id;

    // Find the index of the matching workout
    const workoutIndex = this.#workouts.findIndex(
      workout => workout.id === workoutId
    );

    // Target workout object
    const targetWorkout = this.#workouts.find(
      workout => workout.id === deleteBtn.dataset.id
    );

    // Related HTML element
    const workoutEl = document.querySelector(`[data-id="${workoutId}"]`);

    // Remove workout from the array
    this.#workouts.splice(workoutIndex, 1);

    // Remove the HTML element from UI
    workoutEl.remove();

    // Remove workout marker
    this._removeWorkoutMarker(targetWorkout);

    // Update local storage
    this._setLocalStorage();

    // Close the warning modal
    sidebar.classList.remove('open');

    const allWorkouts = document.querySelectorAll('.workout');
    allWorkouts.forEach(workout => {
      workout.style.opacity = '1';
      workout.style.transform = 'scale(1)';
      workout.style.filter = 'blur(0px)';
    });

    if (this.#workouts.length === 0)
      // Hide delet all and sort button
      deleteAllBtn.classList.add('hide');
    sortBtn.classList.add('hide');
    showAllBtn.classList.add('hide');
    findMeBtn.classList.add('hide');

    if (this.#workouts.length > 0) {
      deleteAllBtn.classList.remove('hide');
      sortBtn.classList.remove('hide');
      showAllBtn.classList.remove('hide');
      findMeBtn.classList.remove('hide');
    }

    if (this.#workouts.length < 2) {
      deleteAllBtn.classList.add('hide');
      sortBtn.classList.add('hide');
      showAllBtn.classList.add('hide');
      findMeBtn.classList.add('hide');
    }
  }

  _cancelDeleteWithPopup() {
    // Close the warning modal
    sidebar.classList.remove('open');
  }

  _removeWorkoutMarker(workout) {
    // Iterate over each layer in the map and check if it's a marker with matching coordinates
    this.#map.eachLayer(layer => {
      if (
        layer instanceof L.Marker &&
        layer.getLatLng().equals(workout.coords)
      ) {
        // Remove the marker from the map
        this.#map.removeLayer(layer);
      }
    });
  }

  _editWorkout(e) {
    if (e.target.classList.contains('edit__btn')) {
      // Find workout object to be edited
      const workoutToEdit = this.#workouts.find(
        workout => workout.id === e.target.dataset.id
      );

      this.#editedCoords = workoutToEdit.coords;

      // Workout index
      const workoutIndex = this.#workouts.findIndex(
        workout => workout.id === e.target.dataset.id
      );

      // HTML element
      const workoutEl = document.querySelector(
        `[data-id="${e.target.dataset.id}"`
      );

      // Show form with current values

      // Set form values to the current workout's values
      inputType.value = workoutToEdit.type;
      inputDistance.value = workoutToEdit.distance;
      inputDuration.value = workoutToEdit.duration;

      if (workoutToEdit.type === 'running') {
        inputCadence.value = workoutToEdit.cadence;
        inputElevation.closest('.form__row').classList.add('form__row--hidden');
        inputCadence
          .closest('.form__row')
          .classList.remove('form__row--hidden');
      }

      if (workoutToEdit.type === 'cycling') {
        inputElevation.value = workoutToEdit.elevationGain;
        inputCadence.closest('.form__row').classList.add('form__row--hidden');
        inputElevation
          .closest('.form__row')
          .classList.remove('form__row--hidden');
      }

      // Show form
      form.classList.add('edit');
      form.classList.remove('hidden');
      inputDistance.focus();
    }
  }

  _showInputValidationPopup() {
    inputValidationPopup.classList.add('openpopup');

    setTimeout(() => inputValidationPopup.classList.remove('openpopup'), 1250);
  }

  _hideFormOnClick(e) {
    if (e.target.classList.contains('sidebar')) form.classList.add('hidden');
  }

  _deleteAllWorkouts() {
    // Show popup
    deleteAllPopup.classList.add('openpopup');
  }

  _manageDeleteAllPopup(e) {
    // All HTML elements
    const allWorkouts = document.querySelectorAll('.workout');

    // Remove all HTML elements from list
    allWorkouts.forEach(workoutEl => {
      workoutEl.remove();
    });

    // Remove all workout markers from the map
    this.#workouts.forEach(workout => this._removeWorkoutMarker(workout));

    // Delete all workouts from the array
    this.#workouts.splice(0, this.#workouts.length);

    // Hiding the buttons
    deleteAllBtn.classList.add('hide');
    sortBtn.classList.add('hide');
    showAllBtn.classList.add('hide');
    findMeBtn.classList.add('hide');

    // close popup
    deleteAllPopup.classList.remove('openpopup');

    // Set local storage
    this._setLocalStorage();
  }

  _cancelDeleteAllWithPopup() {
    deleteAllPopup.classList.remove('openpopup');
  }

  // Sorting by distance method
  _sortWorkoutsByDistance() {
    // Set current map view
    this.#currentMapView = this.#map.getCenter();

    // Toggle sorting order
    this.#sortOrder = this.#sortOrder === 'asc' ? 'desc' : 'asc';

    // Sort workouts based on distance and sorting order
    this.#workouts.sort((a, b) => {
      if (this.#sortOrder === 'asc') {
        return b.distance - a.distance;
      } else {
        return a.distance - b.distance;
      }
    });

    // Button active states
    if (this.#sortOrder === 'desc') {
      sortBtn.classList.add('active');
      sortBtn.textContent = 'Sort by distance ↑';
    } else {
      sortBtn.classList.remove('active');
      sortBtn.textContent = 'Sort by distance ↓';
    }

    // Clear and re-render workouts
    this._clearWorkouts();
    this.#workouts.forEach(workout => {
      this._renderWorkout(workout);
      this._renderWorkoutMarker(workout);
    });

    // Restore the previous map view
    if (this.#currentMapView) {
      this.#map.setView(this.#currentMapView);
    }
  }

  // Add a method to clear workouts and markers from the UI
  _clearWorkouts() {
    // Clear workouts from the UI
    const allWorkouts = document.querySelectorAll('.workout');
    allWorkouts.forEach(workoutEl => workoutEl.remove());

    // Clear all workout markers from the map
    this.#workouts.forEach(workout => this._removeWorkoutMarker(workout));
  }

  _returnNormalState(e) {
    if (e.target.classList.contains('sidebar')) {
      const allWorkouts = document.querySelectorAll('.workout');
      allWorkouts.forEach(workout => {
        workout.style.opacity = '1';
        workout.style.transform = 'scale(1)';
        workout.style.filter = 'blur(0px)';
      });
    }
  }

  _returnNormalStatework(e) {
    if (e.target.classList.contains('workouts')) {
      const allWorkouts = document.querySelectorAll('.workout');
      allWorkouts.forEach(workout => {
        workout.style.opacity = '1';
        workout.style.transform = 'scale(1)';
        workout.style.filter = 'blur(0px)';
      });
    }
  }

  // Display welcome popup
  _displayWelcomePopup() {
    const welcomePopup = document.querySelector('.welcome-popup');

    // Add 'open' class to show the popup
    welcomePopup.classList.add('open');

    // When click close btn, set visited flag true, hide pop-up and remove open class
    const closeBtn = document.querySelector('.close-welcome-btn');
    closeBtn.addEventListener('click', () => {
      localStorage.setItem('visited', 'true');
      welcomePopup.classList.remove('open');
    });
  }

  _showAllWorkouts() {
    if (this.#workouts.length === 0) {
      // No workouts to show
      return;
    }

    // Extract all workout coordinates
    const workoutCoords = this.#workouts.map(workout => workout.coords);

    // Calculate the bounds of all workout coordinates
    const bounds = L.latLngBounds(workoutCoords);

    // Set the map view to fit all workouts within the bounds
    this.#map.fitBounds(bounds, { padding: [50, 50] });
  }

  _findMe() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        this._setMapViewToCurrentLocation.bind(this),
        function () {
          alert('Could not get your current location.');
        }
      );
    }
  }

  _setMapViewToCurrentLocation(position) {
    const { latitude, longitude } = position.coords;

    // Add a workout marker with popup
    const workoutMarker = L.marker([latitude, longitude])
      .bindPopup('You are here')
      .addTo(this.#map);

    workoutMarker
      .bindPopup('<b>You are here!</b>', { autoClose: false })
      .openPopup();

    // Set the map view to the current location, pan to it, and set the zoom level
    this.#map.setView([latitude, longitude], 16, {
      animate: true,
      duration: 1,
    });

    // Set a timeout to remove the marker and popup after 2 seconds
    setTimeout(() => {
      this.#map.removeLayer(workoutMarker);
    }, 2000);
  }

  // Reset functionality
  reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }
}

const app = new App();
