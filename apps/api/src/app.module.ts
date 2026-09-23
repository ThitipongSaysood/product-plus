import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthGuard, ErrorFilter } from "./common/http.js";
import { DataController } from "./modules/data.controller.js";
import { GroupsController } from "./modules/groups.controller.js";
import { JobsController } from "./modules/jobs.controller.js";
import { SystemController } from "./modules/system.controller.js";
import { WeeklyCron } from "./modules/weekly.js";

// No constructor injection anywhere (db/settings are module singletons), so the app also boots
// under tsx/esbuild, which does not emit decorator metadata.
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SystemController, GroupsController, DataController, JobsController],
  providers: [WeeklyCron, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AppModule {}
