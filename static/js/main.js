// Phone number formatting and validation for Indian numbers
function formatPhoneNumber(input) {
  // Remove all non-digit characters
  let value = input.value.replace(/\D/g, "")

  // Limit to 10 digits for Indian numbers
  if (value.length > 10) {
    value = value.slice(0, 10)
  }

  // Format as XXXXX XXXXX (Indian format)
  if (value.length > 5) {
    value = `${value.slice(0, 5)} ${value.slice(5)}`
  }

  input.value = value

  // Validation feedback
  const isValid = value.replace(/\D/g, "").length === 10
  input.classList.toggle("invalid", !isValid && value.length > 0)

  return isValid
}

// Initialize phone number formatting
document.addEventListener("DOMContentLoaded", () => {
  const phoneInputs = document.querySelectorAll('input[type="tel"]')
  phoneInputs.forEach((input) => {
    input.addEventListener("input", function () {
      formatPhoneNumber(this)
    })

    input.addEventListener("keypress", (e) => {
      // Only allow digits
      if (!/\d/.test(e.key) && !["Backspace", "Delete", "Tab", "Enter"].includes(e.key)) {
        e.preventDefault()
      }
    })
  })
})

// Form validation
function validateForm(formId) {
  const form = document.getElementById(formId)
  if (!form) return false

  let isValid = true
  const requiredFields = form.querySelectorAll("[required]")

  requiredFields.forEach((field) => {
    if (!field.value.trim()) {
      field.classList.add("invalid")
      isValid = false
    } else {
      field.classList.remove("invalid")
    }

    // Special validation for phone numbers
    if (field.type === "tel") {
      const phoneValid = formatPhoneNumber(field)
      if (!phoneValid) {
        isValid = false
      }
    }

    // Email validation
    if (field.type === "email" && field.value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(field.value)) {
        field.classList.add("invalid")
        isValid = false
      }
    }
  })

  return isValid
}

// Map functionality
let map, marker
const L = window.L // Declare the L variable

function initializeMap(containerId, defaultLat = 17.385, defaultLng = 78.4867) {
  // Default to Hyderabad, India
  if (typeof L === "undefined") {
    console.error("Leaflet library not loaded")
    return null
  }

  map = L.map(containerId).setView([defaultLat, defaultLng], 13)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map)

  return map
}

function addMapClickHandler(latInputId, lngInputId, addressInputId) {
  if (!map) return

  map.on("click", (e) => {
    const lat = e.latlng.lat
    const lng = e.latlng.lng

    // Remove existing marker
    if (marker) {
      map.removeLayer(marker)
    }

    // Add new marker
    marker = L.marker([lat, lng]).addTo(map)

    // Update form fields
    if (latInputId) document.getElementById(latInputId).value = lat
    if (lngInputId) document.getElementById(lngInputId).value = lng
    if (addressInputId) {
      document.getElementById(addressInputId).value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }

    // Try to get address from coordinates (reverse geocoding)
    reverseGeocode(lat, lng, addressInputId)
  })
}

function reverseGeocode(lat, lng, addressInputId) {
  // Simple reverse geocoding using Nominatim (OpenStreetMap)
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
    .then((response) => response.json())
    .then((data) => {
      if (data.display_name && addressInputId) {
        document.getElementById(addressInputId).value = data.display_name
      }
    })
    .catch((error) => {
      console.log("Reverse geocoding failed:", error)
    })
}

// Location search functionality
function searchLocation(query, callback) {
  if (query.length < 3) return

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`)
    .then((response) => response.json())
    .then((data) => {
      const suggestions = data.map((item) => ({
        display_name: item.display_name,
        lat: Number.parseFloat(item.lat),
        lon: Number.parseFloat(item.lon),
      }))
      callback(suggestions)
    })
    .catch((error) => {
      console.log("Location search failed:", error)
      callback([])
    })
}

function setupLocationAutocomplete(inputId, latInputId, lngInputId) {
  const input = document.getElementById(inputId)
  if (!input) return

  const suggestionsList = null
  let debounceTimer = null

  // Create suggestions dropdown
  const suggestionsContainer = document.createElement("div")
  suggestionsContainer.className = "location-suggestions"
  suggestionsContainer.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #2f3136;
    border: 1px solid #40444b;
    border-top: none;
    border-radius: 0 0 4px 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
    display: none;
  `

  // Make input container relative
  input.parentElement.style.position = "relative"
  input.parentElement.appendChild(suggestionsContainer)

  input.addEventListener("input", function () {
    clearTimeout(debounceTimer)
    const query = this.value.trim()

    if (query.length < 3) {
      suggestionsContainer.style.display = "none"
      return
    }

    debounceTimer = setTimeout(() => {
      searchLocation(query, (suggestions) => {
        suggestionsContainer.innerHTML = ""

        if (suggestions.length === 0) {
          suggestionsContainer.style.display = "none"
          return
        }

        suggestions.forEach((suggestion) => {
          const item = document.createElement("div")
          item.className = "suggestion-item"
          item.style.cssText = `
            padding: 12px 16px;
            cursor: pointer;
            border-bottom: 1px solid #40444b;
            color: #dcddde;
            font-size: 0.9rem;
          `
          item.textContent = suggestion.display_name

          item.addEventListener("mouseenter", function () {
            this.style.backgroundColor = "#40444b"
          })

          item.addEventListener("mouseleave", function () {
            this.style.backgroundColor = "transparent"
          })

          item.addEventListener("click", () => {
            input.value = suggestion.display_name
            if (latInputId) document.getElementById(latInputId).value = suggestion.lat
            if (lngInputId) document.getElementById(lngInputId).value = suggestion.lon

            // Update map if available
            if (map) {
              map.setView([suggestion.lat, suggestion.lon], 15)

              // Remove existing marker
              if (marker) {
                map.removeLayer(marker)
              }

              // Add new marker
              marker = L.marker([suggestion.lat, suggestion.lon]).addTo(map)
            }

            suggestionsContainer.style.display = "none"
          })

          suggestionsContainer.appendChild(item)
        })

        suggestionsContainer.style.display = "block"
      })
    }, 300)
  })

  // Hide suggestions when clicking outside
  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.style.display = "none"
    }
  })
}

// Add mobile detection
function isMobileDevice() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  )
}

// Add touch detection
function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0
}

// Mobile-optimized location detection
function getCurrentLocationUrgent(latInputId, lngInputId, addressInputId) {
  if (!navigator.geolocation) {
    showNotification("❌ Location services not available on this device", "error", 5000)
    return
  }

  const isMobile = isMobileDevice()
  const isTouch = isTouchDevice()

  // Show mobile-optimized loading notification
  const loadingMessage = isMobile
    ? "📱 Getting your location...\nPlease keep the app open"
    : "🔍 Getting your precise location... Please wait"

  const loadingNotification = showNotification(loadingMessage, "info", 0)

  // Mobile-optimized geolocation options
  const options = {
    enableHighAccuracy: true,
    timeout: isMobile ? 45000 : 30000, // Longer timeout for mobile
    maximumAge: 0,
  }

  console.log(`📱 Mobile device detected: ${isMobile}, Touch: ${isTouch}`)
  console.log("🎯 Starting mobile-optimized location detection...")

  let attempts = 0
  const maxAttempts = isMobile ? 2 : 3 // Fewer attempts on mobile to save battery
  let bestLocation = null
  let bestAccuracy = Number.POSITIVE_INFINITY

  // Add mobile-specific vibration feedback if available
  function vibrateIfSupported(pattern = [100]) {
    if (navigator.vibrate && isMobile) {
      navigator.vibrate(pattern)
    }
  }

  function attemptLocation() {
    attempts++
    console.log(`📍 Mobile location attempt ${attempts}/${maxAttempts}`)

    // Show attempt progress on mobile
    if (isMobile && loadingNotification) {
      const progressMessage = `📱 Getting location... (${attempts}/${maxAttempts})\n${attempts === 1 ? "Please allow location access" : "Improving accuracy..."}`
      loadingNotification.innerHTML = progressMessage
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const accuracy = position.coords.accuracy
        const altitude = position.coords.altitude
        const speed = position.coords.speed
        const heading = position.coords.heading
        const timestamp = new Date(position.timestamp)

        console.log(`✅ Mobile location detected:`)
        console.log(`   Coordinates: ${lat}, ${lng}`)
        console.log(`   Accuracy: ${accuracy} meters`)
        console.log(`   Device: ${navigator.userAgent}`)

        // Vibrate on successful location detection
        vibrateIfSupported([50, 50, 50])

        // Mobile devices often have less accurate GPS, so be more lenient
        const acceptableAccuracy = isMobile ? 50 : 20

        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy
          bestLocation = { lat, lng, accuracy, timestamp }
          console.log(`🎯 New best mobile location with ${accuracy}m accuracy`)
        }

        // Use location if accuracy is acceptable or max attempts reached
        if (accuracy < acceptableAccuracy || attempts >= maxAttempts) {
          useLocation(bestLocation || { lat, lng, accuracy, timestamp })
        } else {
          console.log(`🔄 Mobile accuracy ${accuracy}m not ideal, trying again...`)
          setTimeout(attemptLocation, 2000)
        }
      },
      (error) => {
        console.error(`❌ Mobile location attempt ${attempts} failed:`, error)

        // Vibrate on error
        vibrateIfSupported([200, 100, 200])

        if (attempts < maxAttempts) {
          console.log(`🔄 Retrying mobile location detection...`)
          setTimeout(attemptLocation, 3000) // Longer delay for mobile
        } else {
          handleMobileLocationError(error)
        }
      },
      options,
    )
  }

  function useLocation(location) {
    // Hide loading notification
    if (loadingNotification && loadingNotification.remove) {
      loadingNotification.remove()
    }

    const { lat, lng, accuracy, timestamp } = location

    console.log(`🎯 Using mobile location: ${lat}, ${lng} (${accuracy}m accuracy)`)

    // Success vibration
    vibrateIfSupported([100, 50, 100, 50, 100])

    // Update form fields with high precision
    if (latInputId) document.getElementById(latInputId).value = lat.toFixed(8)
    if (lngInputId) document.getElementById(lngInputId).value = lng.toFixed(8)

    // Mobile-optimized map update
    if (map) {
      const zoomLevel = isMobile ? 16 : 18 // Slightly less zoom on mobile for better context
      map.setView([lat, lng], zoomLevel)

      // Remove existing marker and accuracy circle
      if (marker) {
        map.removeLayer(marker)
      }

      // Add mobile-optimized marker
      marker = L.marker([lat, lng]).addTo(map)

      // Mobile-friendly accuracy circle
      const accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: accuracy < 20 ? "#10b981" : accuracy < 100 ? "#faa61a" : "#ed4245",
        fillColor: accuracy < 20 ? "#10b981" : accuracy < 100 ? "#faa61a" : "#ed4245",
        fillOpacity: 0.15,
        weight: isMobile ? 3 : 2,
        dashArray: isMobile ? "8, 8" : "5, 5",
      }).addTo(map)

      // Mobile-optimized popup
      const popupContent = `
        <div style="text-align: center; padding: 0.75rem; max-width: 200px;">
          <h4 style="margin: 0 0 0.5rem 0; color: #ed4245; font-size: 1rem;">📱 Your Location</h4>
          <div style="font-size: 0.85rem; line-height: 1.4;">
            <div><strong>Accuracy:</strong> ±${Math.round(accuracy)}m</div>
            <div><strong>Time:</strong> ${timestamp.toLocaleTimeString()}</div>
            <div style="color: ${accuracy < 20 ? "#10b981" : accuracy < 100 ? "#faa61a" : "#ed4245"}; font-weight: bold; margin-top: 0.25rem;">
              ${accuracy < 20 ? "🎯 Excellent" : accuracy < 100 ? "✅ Good" : "📍 Fair"} Precision
            </div>
          </div>
        </div>
      `
      marker.bindPopup(popupContent).openPopup()

      // Auto-close popup on mobile after 3 seconds
      if (isMobile) {
        setTimeout(() => {
          marker.closePopup()
        }, 3000)
      }
    }

    // Get address with mobile optimization
    reverseGeocodeDetailed(lat, lng, addressInputId, accuracy)

    // Mobile-optimized success notification
    const accuracyText = accuracy < 20 ? "excellent" : accuracy < 100 ? "good" : "fair"
    const accuracyIcon = accuracy < 20 ? "🎯" : accuracy < 100 ? "✅" : "📍"
    const mobileMessage = isMobile
      ? `${accuracyIcon} Location found!\nAccuracy: ±${Math.round(accuracy)}m`
      : `${accuracyIcon} Location detected with ${accuracyText} precision (±${Math.round(accuracy)}m)`

    showNotification(mobileMessage, accuracy < 100 ? "success" : "warning", isMobile ? 4000 : 5000)
  }

  function handleMobileLocationError(error) {
    // Hide loading notification
    if (loadingNotification && loadingNotification.remove) {
      loadingNotification.remove()
    }

    // Error vibration
    vibrateIfSupported([300, 100, 300])

    let errorMessage = "❌ Can't get your location. "
    let suggestions = ""

    console.error("🚨 Mobile geolocation error:", error)

    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage += "Location access denied."
        suggestions = isMobile
          ? "Please enable location in your browser settings and refresh the page."
          : "Please enable location permissions in your browser settings and try again."
        break
      case error.POSITION_UNAVAILABLE:
        errorMessage += "Location unavailable."
        suggestions = isMobile
          ? "Try moving outside or to a window for better GPS signal."
          : "Please check your device's location settings and ensure you have a good signal."
        break
      case error.TIMEOUT:
        errorMessage += "Location request timed out."
        suggestions = isMobile
          ? "GPS is taking too long. Try moving to an open area."
          : "Please try again or move to an area with better signal reception."
        break
      default:
        errorMessage += "Unknown error occurred."
        suggestions = "Please try again or click on the map to select your location."
        break
    }

    showNotification(errorMessage, "error", isMobile ? 6000 : 8000)

    // Show mobile-specific help
    setTimeout(() => {
      const helpMessage = isMobile
        ? "💡 Tip: " + suggestions + "\n\nOr tap on the map to select your location manually."
        : `💡 Tip: ${suggestions}`
      showNotification(helpMessage, "info", isMobile ? 8000 : 10000)
    }, 2000)

    // Mobile-optimized fallback
    if (map && navigator.geolocation) {
      const fallbackOptions = {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000, // 10 minutes - more lenient for mobile
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.setView([position.coords.latitude, position.coords.longitude], isMobile ? 14 : 15)
          showNotification("📍 Showing approximate area - tap on map for exact location", "info", 5000)
        },
        () => {
          // Final fallback to Hyderabad
          map.setView([17.385, 78.4867], isMobile ? 12 : 13)
          showNotification("🗺️ Please tap on the map to select your location", "info", 5000)
        },
        fallbackOptions,
      )
    }
  }

  // Start the mobile location detection process
  attemptLocation()
}

// Mobile-optimized notification system
function showNotification(message, type = "info", duration = 5000) {
  const isMobile = isMobileDevice()

  const notification = document.createElement("div")
  notification.className = `alert alert-${type} notification`
  notification.innerHTML = message.replace(/\n/g, "<br>") // Support line breaks

  const mobileStyles = isMobile
    ? `
    left: 10px;
    right: 10px;
    top: 10px;
    max-width: none;
    font-size: 0.9rem;
    line-height: 1.4;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  `
    : `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 350px;
    border-radius: 8px;
  `

  notification.style.cssText = `
    position: fixed;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
    font-weight: 500;
    ${mobileStyles}
  `

  document.body.appendChild(notification)

  // Mobile-optimized close button for persistent notifications
  if (duration === 0) {
    const closeBtn = document.createElement("button")
    closeBtn.innerHTML = "×"
    closeBtn.style.cssText = `
      position: absolute;
      top: ${isMobile ? "12px" : "8px"};
      right: ${isMobile ? "16px" : "12px"};
      background: none;
      border: none;
      color: inherit;
      font-size: ${isMobile ? "24px" : "18px"};
      cursor: pointer;
      opacity: 0.7;
      padding: ${isMobile ? "8px" : "4px"};
      line-height: 1;
    `
    closeBtn.onclick = () => {
      notification.style.animation = "slideOut 0.3s ease-in"
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification)
        }
      }, 300)
    }
    notification.appendChild(closeBtn)
    notification.style.paddingRight = isMobile ? "50px" : "40px"

    // Return the notification for manual removal
    notification.remove = closeBtn.onclick
    return notification
  } else {
    // Auto-remove after duration
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = "slideOut 0.3s ease-in"
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification)
          }
        }, 300)
      }
    }, duration)
  }
}

// Add mobile keyboard handling
function handleMobileKeyboard() {
  if (!isMobileDevice()) return

  const initialViewportHeight = window.innerHeight

  window.addEventListener("resize", () => {
    const currentHeight = window.innerHeight
    const heightDifference = initialViewportHeight - currentHeight

    // If height decreased significantly, keyboard is likely open
    if (heightDifference > 150) {
      document.body.classList.add("keyboard-open")
    } else {
      document.body.classList.remove("keyboard-open")
    }
  })

  // Handle input focus for mobile
  const inputs = document.querySelectorAll("input, textarea, select")
  inputs.forEach((input) => {
    input.addEventListener("focus", function () {
      if (isMobileDevice()) {
        // Scroll input into view on mobile
        setTimeout(() => {
          this.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 300)
      }
    })
  })
}

// Initialize mobile optimizations
document.addEventListener("DOMContentLoaded", () => {
  if (isMobileDevice()) {
    console.log("📱 Mobile device detected - applying mobile optimizations")
    handleMobileKeyboard()

    // Add mobile-specific meta tag if not present
    if (!document.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement("meta")
      viewport.name = "viewport"
      viewport.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      document.head.appendChild(viewport)
    }

    // Prevent zoom on input focus for iOS
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="tel"], input[type="email"], textarea, select',
    )
    inputs.forEach((input) => {
      input.style.fontSize = "16px" // Prevents zoom on iOS
    })
  }
})

function reverseGeocodeDetailed(lat, lng, addressInputId, accuracy) {
  // Use multiple geocoding services for better results
  const services = [
    {
      name: "Nominatim",
      url: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      parser: (data) => data.display_name,
    },
  ]

  // Try each service
  services.forEach((service, index) => {
    setTimeout(() => {
      fetch(service.url)
        .then((response) => response.json())
        .then((data) => {
          console.log(`📍 ${service.name} geocoding result:`, data)

          if (data && service.parser(data) && addressInputId) {
            const address = service.parser(data)
            const addressField = document.getElementById(addressInputId)

            if (addressField && (!addressField.value || addressField.value.includes("°"))) {
              addressField.value = address
              console.log(`✅ Address updated from ${service.name}: ${address}`)
            }
          }
        })
        .catch((error) => {
          console.log(`❌ ${service.name} geocoding failed:`, error)
        })
    }, index * 1000) // Stagger requests
  })
}

function getUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        if (map) {
          map.setView([lat, lng], 15)
        }
      },
      (error) => {
        console.log("Geolocation error:", error)
        // Fallback to Hyderabad if geolocation fails
        if (map) {
          map.setView([17.385, 78.4867], 13)
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      },
    )
  }
}

// Modal functionality
function openModal(modalId) {
  const modal = document.getElementById(modalId)
  if (modal) {
    modal.classList.remove("hidden")
    document.body.style.overflow = "hidden"
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId)
  if (modal) {
    modal.classList.add("hidden")
    document.body.style.overflow = "auto"
  }
}

// Close modal when clicking outside
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    closeModal(e.target.id)
  }
})

// Loading states
function showLoading(buttonId) {
  const button = document.getElementById(buttonId)
  if (button) {
    button.disabled = true
    button.innerHTML = '<span class="loading"></span> Processing...'
  }
}

function hideLoading(buttonId, originalText) {
  const button = document.getElementById(buttonId)
  if (button) {
    button.disabled = false
    button.innerHTML = originalText
  }
}

// Form submission with loading state
function submitFormWithLoading(formId, buttonId) {
  const form = document.getElementById(formId)
  const button = document.getElementById(buttonId)

  if (!form || !button) return

  const originalText = button.innerHTML

  form.addEventListener("submit", (e) => {
    if (!validateForm(formId)) {
      e.preventDefault()
      return
    }

    showLoading(buttonId)

    // Reset loading state after 5 seconds (fallback)
    setTimeout(() => {
      hideLoading(buttonId, originalText)
    }, 5000)
  })
}

// Auto-resize textareas
function autoResizeTextarea(textarea) {
  textarea.style.height = "auto"
  textarea.style.height = textarea.scrollHeight + "px"
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialize auto-resize for all textareas
  const textareas = document.querySelectorAll("textarea")
  textareas.forEach((textarea) => {
    textarea.addEventListener("input", function () {
      autoResizeTextarea(this)
    })
  })
})

// Real-time form validation
function addRealTimeValidation(formId) {
  const form = document.getElementById(formId)
  if (!form) return

  const inputs = form.querySelectorAll("input, textarea, select")
  inputs.forEach((input) => {
    input.addEventListener("blur", function () {
      validateField(this)
    })

    input.addEventListener("input", function () {
      if (this.classList.contains("invalid")) {
        validateField(this)
      }
    })
  })
}

function validateField(field) {
  let isValid = true

  // Required field validation
  if (field.hasAttribute("required") && !field.value.trim()) {
    isValid = false
  }

  // Email validation
  if (field.type === "email" && field.value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(field.value)) {
      isValid = false
    }
  }

  // Phone validation for Indian numbers
  if (field.type === "tel" && field.value) {
    const phoneDigits = field.value.replace(/\D/g, "")
    if (phoneDigits.length !== 10) {
      isValid = false
    }
  }

  // Update field appearance
  field.classList.toggle("invalid", !isValid)

  return isValid
}

// Smooth scrolling for anchor links
document.addEventListener("DOMContentLoaded", () => {
  const anchorLinks = document.querySelectorAll('a[href^="#"]')
  anchorLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault()
      const targetId = this.getAttribute("href").substring(1)
      const targetElement = document.getElementById(targetId)

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }
    })
  })
})

// Update the export to include mobile utilities
window.CrimeReportingApp = {
  formatPhoneNumber,
  validateForm,
  initializeMap,
  addMapClickHandler,
  getUserLocation,
  openModal,
  closeModal,
  showLoading,
  hideLoading,
  submitFormWithLoading,
  showNotification,
  addRealTimeValidation,
  setupLocationAutocomplete,
  getCurrentLocationUrgent,
  isMobileDevice,
  isTouchDevice,
}

