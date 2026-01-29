// Function to format the date
export function formatBookingDate(dateString: string | undefined | null): string {
  if (!dateString || typeof dateString !== 'string') {
    return "Select Date";
  }
  
  const date = new Date(dateString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }
  
  const day = date.getDate();
  const daySuffix = getDaySuffix(day);
  const month = date.toLocaleString("default", { month: "long" });

  return `${day}${daySuffix}, ${month}`;
}

// Function to format the time
export function formatBookingTime(timeString: string | undefined | null): string {
  if (!timeString || typeof timeString !== 'string') {
    return "Select Time";
  }
  const [hours, minutes] = timeString.split(":").map(Number);
  const period = hours >= 12 ? "pm" : "am";
  const formattedHours = hours % 12 || 12; // Convert to 12-hour format

  return `${formattedHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

// Helper function to get the appropriate suffix for the day
function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
