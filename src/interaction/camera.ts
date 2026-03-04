import { mod } from "../utils/math";

export type Camera = {
  offsetRow: number;
  offsetCol: number;
};

export class CameraController implements Camera {
  private _offsetRow = 0;
  private _offsetCol = 0;
  private rows: number;
  private cols: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
  }

  get offsetRow() {
    return this._offsetRow;
  }

  get offsetCol() {
    return this._offsetCol;
  }

  move(dr: number, dc: number) {
    this._offsetRow = mod(this._offsetRow + dr, this.rows);
    this._offsetCol = mod(this._offsetCol + dc, this.cols);
  }

  reset() {
    this._offsetRow = 0;
    this._offsetCol = 0;
  }
}
