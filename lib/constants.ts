export type EventItem = {
  title: string;
  image: string;
  slug: string;
  location: string;
  date: string;
  time: string;
};

export const events: EventItem[] = [
  {
    title: "Web Summit 2026",
    image: "/images/event1.png",
    slug: "web-summit-2026",
    location: "Lisbon, Portugal",
    date: "2026-11-09",
    time: "09:00 AM",
  },
  {
    title: "KubeCon + CloudNativeCon North America 2026",
    image: "/images/event2.png",
    slug: "kubecon-cloudnativecon-na-2026",
    location: "Salt Lake City, UT, USA",
    date: "2026-11-10",
    time: "09:00 AM",
  },
  {
    title: "AWS re:Invent 2026",
    image: "/images/event3.png",
    slug: "aws-reinvent-2026",
    location: "Las Vegas, NV, USA",
    date: "2026-11-30",
    time: "08:00 AM",
  },
  {
    title: "ETHDenver 2027",
    image: "/images/event4.png",
    slug: "ethdenver-2027",
    location: "Denver, CO, USA",
    date: "2027-02-18",
    time: "10:00 AM",
  },
  {
    title: "JSWorld Conference 2027",
    image: "/images/event5.png",
    slug: "jsworld-conference-2027",
    location: "Amsterdam, Netherlands",
    date: "2027-03-03",
    time: "09:30 AM",
  },
  {
    title: "Google I/O 2027",
    image: "/images/event6.png",
    slug: "google-io-2027",
    location: "Mountain View, CA, USA",
    date: "2027-05-19",
    time: "10:00 AM",
  },
];
