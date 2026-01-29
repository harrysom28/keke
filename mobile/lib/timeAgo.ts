export function timeAgo(date: string | Date): string {
  const now = new Date();
  const pastDate = typeof date === "string" ? new Date(date) : date;

  // Check if pastDate is valid
  if (isNaN(pastDate.getTime())) {
    return "Invalid date";
  }

  if (pastDate > now) {
    return "in the future";
  }

  const seconds = Math.floor((now.getTime() - pastDate.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return seconds === 1 ? "one second ago" : `${seconds} seconds ago`;
  } else if (minutes < 60) {
    return minutes === 1 ? "one minute ago" : `${minutes} minutes ago`;
  } else if (hours < 24) {
    return hours === 1 ? "one hour ago" : `${hours} hours ago`;
  } else if (days < 30) {
    return days === 1 ? "one day ago" : `${days} days ago`;
  } else if (months < 12) {
    return months === 1 ? "one month ago" : `${months} months ago`;
  } else {
    return years === 1 ? "one year ago" : `${years} years ago`;
  }
}
