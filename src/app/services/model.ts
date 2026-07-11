export interface DateOnly {
  year: number;
  month: number;
  day: number;
  dayOfWeek?: number;
}

export interface Milktrn {
  milksrno?: number;
  mltrno?: number;
  trndate: DateOnly;
  membCode: number;
  cobf: string;
  fat: number;
  rate: number;
  liters: number;
  amount: number;
  me: number;
  socCode: number;
  deviceId: number;
  [key: string]: any; 
}

export interface MilkTrnViewModel {
  milktrn: Milktrn[];
  me: number;
  fromDate: DateOnly;
  toDate: DateOnly;
}

export interface MilkSale {
  trdate: DateOnly;
  liters: number;
  cobf: string;
  me: number;
  rate: number;
  tot: number;
  membCode: number;
  socCode: number;
  deviceId: number;
}

export interface MilkSaleViewModel {
  milksale: MilkSale[];
  me: number;
  fromDate: DateOnly;
  toDate: DateOnly;
}